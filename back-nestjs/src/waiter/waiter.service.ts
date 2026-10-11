import { PrismaService } from '@/prisma.service'
import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException
} from '@nestjs/common'
import { Prisma, StopType } from '@prisma/client'
import { CreateOrderDto } from './dto/create-order.dto'
import { countPortions, inventoryTransaction, refreshAutoStops } from '../inventory/availability'

type Tx = Prisma.TransactionClient
type Db = Tx | PrismaService
type Decimal = Prisma.Decimal

type ProductNeed = {
	amount: Decimal
	productName: string
	unit: string
	dishes: { name: string; count: number }[]
}

type OrderLine = { dishId: string; count: number; excluded: string[] }

const ZERO = new Prisma.Decimal(0)

const HOT_LIMIT = 3
const HOT_WINDOW_HOURS = 72

const HOUR_MS = 60 * 60 * 1000

@Injectable()
export class WaiterService {
	constructor(private prisma: PrismaService) {}

	async getMenu() {
		const now = new Date()

		const [dishes, batches] = await Promise.all([
			this.prisma.dish.findMany({
				where: { deletedAt: null },
				orderBy: { name: 'asc' },
				select: {
					id: true,
					name: true,
					image: true,
					ingredients: {
						select: {
							idProduct: true,
							count: true,
							product: { select: { nameProduct: true } }
						}
					},
					stopLists: { where: { type: StopType.MANUAL }, select: { type: true } }
				}
			}),
			this.getFreshBatches(this.prisma, now)
		])

		const stock = this.sumStock(batches)
		const nearestExp = new Map<string, Date>()
		for (const batch of batches) {
			if (!nearestExp.has(batch.idProduct)) {
				nearestExp.set(batch.idProduct, batch.EXP)
			}
		}

		const menu = dishes.map(dish => {
			const portions = countPortions(dish.ingredients, stock)

			const expiring = dish.ingredients
				.filter(i => nearestExp.has(i.idProduct))
				.map(i => ({
					productName: i.product.nameProduct,
					expiresAt: nearestExp.get(i.idProduct)!
				}))
				.sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime())[0]

			return {
				id: dish.id,
				name: dish.name,
				image: dish.image,
				portions: portions ?? 0,
				hasRecipe: dish.ingredients.length > 0,
				// Фронту для проверки всего чека: у разных блюд бывают общие продукты
				ingredients: dish.ingredients.map(i => ({
					productId: i.idProduct,
					name: i.product.nameProduct,
					perPortion: i.count.toString(),
					available: (stock.get(i.idProduct) ?? ZERO).toString()
				})),
				stops:[...dish.stopLists.map(stop => stop.type), ...(portions === 0 ? [StopType.AUTO] : [])],
				missing: dish.ingredients
					.filter(i => (stock.get(i.idProduct) ?? ZERO).lt(i.count))
					.map(i => i.product.nameProduct),
				expiring: expiring
					? {
							productName: expiring.productName,
							expiresAt: expiring.expiresAt.toISOString()
						}
					: null,
				priority: expiring ? this.priority(expiring.expiresAt, now) : 0
			}
		})

		const isStopped = (dish: (typeof menu)[number]) =>
			dish.stops.length > 0 || dish.portions === 0 || !dish.hasRecipe

		const available = menu
			.filter(dish => !isStopped(dish))
			.sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name))
		const stopped = menu.filter(isStopped)

		return [
			...available.map(({ priority, ...dish }, index) => ({
				...dish,
				isStopped: false,
				isHot:
					index < HOT_LIMIT &&
					!!dish.expiring &&
					new Date(dish.expiring.expiresAt).getTime() - now.getTime() <=
						HOT_WINDOW_HOURS * HOUR_MS
			})),
			...stopped.map(({ priority, ...dish }) => ({
				...dish,
				isStopped: true,
				isHot: false
			}))
		]
	}

	async createOrder(userId: string, dto: CreateOrderDto) {
		// Одно блюдо может быть в чеке несколькими строками: обычное и «без лука».
		// Одинаковые строки (блюдо + тот же набор «без») складываем
		const lines = new Map<string, OrderLine>()
		for (const item of dto.items) {
			const excluded = [...new Set(item.excludedProductIds ?? [])].sort()
			const key = `${item.dishId}|${excluded.join(',')}`
			const line = lines.get(key)
			if (line) line.count += item.count
			else lines.set(key, { dishId: item.dishId, count: item.count, excluded })
		}
		const dishIds = [...new Set([...lines.values()].map(line => line.dishId))]

		return inventoryTransaction(this.prisma, async tx => {
			const now = new Date()

			const dishes = await tx.dish.findMany({
				where: { id: { in: dishIds }, deletedAt: null },
				select: {
					id: true,
					name: true,
					ingredients: {
						select: {
							idProduct: true,
							count: true,
							product: {
								select: { nameProduct: true, unit: { select: { name: true } } }
							}
						}
					},
					stopLists: { where: { type: StopType.MANUAL }, select: { type: true } }
				}
			})
			if (dishes.length !== dishIds.length) {
				throw new NotFoundException('Блюдо не найдено — обновите меню')
			}

			const withoutRecipe = dishes.filter(dish => !dish.ingredients.length)
			if (withoutRecipe.length) {
				throw new BadRequestException(
					`У блюда не задан состав: ${withoutRecipe.map(d => d.name).join(', ')}`
				)
			}

			const dishById = new Map(dishes.map(dish => [dish.id, dish]))
			for (const line of lines.values()) {
				const dish = dishById.get(line.dishId)!
				const recipe = new Set(dish.ingredients.map(i => i.idProduct))
				if (line.excluded.some(id => !recipe.has(id))) {
					throw new BadRequestException(
						`Состав блюда «${dish.name}» изменился — обновите меню`
					)
				}
				if (line.excluded.length >= recipe.size) {
					throw new BadRequestException(
						`Нельзя убрать из блюда «${dish.name}» все продукты`
					)
				}
			}

			const productIds = [
				...new Set(dishes.flatMap(d => d.ingredients.map(i => i.idProduct)))
			]
			const batches = await this.getFreshBatches(tx, now, productIds)
			const stock = this.sumStock(batches)

			const availablePortions = () =>
				dishes.map(dish => ({
					dishId: dish.id,
					name: dish.name,
					portions:
						dish.stopLists.length > 0
							? 0
							: (countPortions(dish.ingredients, stock) ?? 0)
				}))

			const stopped = dishes.filter(dish => dish.stopLists.length > 0)
			if (stopped.length) {
				throw new ConflictException({
					message: 'Заказ не принят: блюдо в стоп-листе',
					stopped: stopped.map(dish => dish.name),
					shortages: [],
					available: availablePortions()
				})
			}

			// Убранные гостем продукты не нужны и со склада не списываются
			const need = new Map<string, ProductNeed>()
			for (const line of lines.values()) {
				const dish = dishById.get(line.dishId)!
				const name = line.excluded.length
					? `${dish.name} (без: ${dish.ingredients
							.filter(i => line.excluded.includes(i.idProduct))
							.map(i => i.product.nameProduct)
							.join(', ')})`
					: dish.name
				for (const ingredient of dish.ingredients) {
					if (line.excluded.includes(ingredient.idProduct)) continue
					const entry = need.get(ingredient.idProduct) ?? {
						amount: ZERO,
						productName: ingredient.product.nameProduct,
						unit: ingredient.product.unit.name,
						dishes: []
					}
					entry.amount = entry.amount.plus(ingredient.count.mul(line.count))
					entry.dishes.push({ name, count: line.count })
					need.set(ingredient.idProduct, entry)
				}
			}

			const shortages = [...need.entries()]
				.filter(([productId, entry]) =>
					(stock.get(productId) ?? ZERO).lt(entry.amount)
				)
				.map(([productId, entry]) => ({
					productName: entry.productName,
					unit: entry.unit,
					need: entry.amount.toString(),
					available: (stock.get(productId) ?? ZERO).toString(),
					dishes: entry.dishes
				}))

			if (shortages.length) {
				throw new ConflictException({
					message: 'Заказ не принят: не хватает продуктов',
					stopped: [],
					shortages,
					available: availablePortions()
				})
			}

			const order = await tx.order.create({
				data: {
					createrId: userId,
					items: {
						create: [...lines.values()].map(line => ({
							idDish: line.dishId,
							count: line.count,
							exclusions: {
								create: line.excluded.map(idProduct => ({ idProduct }))
							}
						}))
					}
				},
				select: { id: true, createDate: true }
			})

			for (const [productId, entry] of need) {
				let remaining = entry.amount

				for (const batch of batches) {
					if (remaining.lte(0)) break
					if (batch.idProduct !== productId) continue

					const take = Prisma.Decimal.min(batch.count, remaining)

					const updated = await tx.batch.updateMany({
						where: { id: batch.id, count: { gte: take }, EXP: { gt: now } },
						data: { count: { decrement: take } }
					})
					if (updated.count === 0) {
						throw new ConflictException({
							message: 'Остатки изменились, пока заказ отправлялся. Отправьте ещё раз',
							stopped: [],
							shortages: [],
							available: []
						})
					}

					await tx.stockMovement.create({
						data: {
							idBatch: batch.id,
							count: take,
							idOrder: order.id,
							createrId: userId
						}
					})

					remaining = remaining.minus(take)
				}
			}

			await refreshAutoStops(tx, { ingredients: { some: { idProduct: { in: productIds } } } })

			return order
		})
	}

	private priority(expiresAt: Date, now: Date) {
		const hoursLeft = Math.max((expiresAt.getTime() - now.getTime()) / HOUR_MS, 1)
		return 1 / hoursLeft
	}

	private getFreshBatches(db: Db, now: Date, productIds?: string[]) {
		return db.batch.findMany({
			where: {
				EXP: { gt: now },
				count: { gt: 0 },
				...(productIds && { idProduct: { in: productIds } })
			},
			orderBy: [{ EXP: 'asc' }, { id: 'asc' }],
			select: { id: true, idProduct: true, count: true, EXP: true }
		})
	}

	private sumStock(batches: { idProduct: string; count: Decimal }[]) {
		const stock = new Map<string, Decimal>()
		for (const batch of batches) {
			stock.set(
				batch.idProduct,
				(stock.get(batch.idProduct) ?? ZERO).plus(batch.count)
			)
		}
		return stock
	}

}
