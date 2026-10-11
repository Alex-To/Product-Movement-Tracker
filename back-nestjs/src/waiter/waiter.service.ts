import { PrismaService } from '@/prisma.service'
import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException
} from '@nestjs/common'
import { Prisma, StopType } from '@prisma/client'
import { CreateOrderDto } from './dto/create-order.dto'

type Tx = Prisma.TransactionClient
type Db = Tx | PrismaService
type Decimal = Prisma.Decimal
type Ingredient = { idProduct: string; count: Decimal }
type ProductNeed = {
	amount: Decimal
	productName: string
	unit: string
	dishes: { name: string; count: number }[]
}

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
				orderBy: { name: 'asc' },
				select: {
					id: true,
					name: true,
					ingredients: {
						select: {
							idProduct: true,
							count: true,
							product: { select: { nameProduct: true } }
						}
					},
					stopLists: { select: { type: true } }
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
			const portions = this.countPortions(dish.ingredients, stock)

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
				portions: portions ?? 0,
				hasRecipe: dish.ingredients.length > 0,
				stops: dish.stopLists.map(stop => stop.type),
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
		const counts = new Map<string, number>()
		for (const item of dto.items) {
			counts.set(item.dishId, (counts.get(item.dishId) ?? 0) + item.count)
		}
		const dishIds = [...counts.keys()]

		return this.prisma.$transaction(async tx => {
			const now = new Date()

			const dishes = await tx.dish.findMany({
				where: { id: { in: dishIds } },
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
					stopLists: { select: { type: true } }
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
							: (this.countPortions(dish.ingredients, stock) ?? 0)
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

			const need = new Map<string, ProductNeed>()
			for (const dish of dishes) {
				const portions = counts.get(dish.id)!
				for (const ingredient of dish.ingredients) {
					const entry = need.get(ingredient.idProduct) ?? {
						amount: ZERO,
						productName: ingredient.product.nameProduct,
						unit: ingredient.product.unit.name,
						dishes: []
					}
					entry.amount = entry.amount.plus(ingredient.count.mul(portions))
					entry.dishes.push({ name: dish.name, count: portions })
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
						create: dishIds.map(dishId => ({
							idDish: dishId,
							count: counts.get(dishId)!
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

			await this.recalcAutoStops(tx, productIds)

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
			orderBy: { EXP: 'asc' },
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

	private countPortions(ingredients: Ingredient[], stock: Map<string, Decimal>) {
		if (!ingredients.length) return null

		return Math.min(
			...ingredients.map(i =>
				(stock.get(i.idProduct) ?? ZERO).div(i.count).floor().toNumber()
			)
		)
	}

	private async recalcAutoStops(tx: Tx, productIds: string[]) {
		const dishes = await tx.dish.findMany({
			where: { ingredients: { some: { idProduct: { in: productIds } } } },
			select: {
				id: true,
				ingredients: { select: { idProduct: true, count: true } }
			}
		})
		const stock = this.sumStock(await this.getFreshBatches(tx, new Date()))

		for (const dish of dishes) {
			if (this.countPortions(dish.ingredients, stock) === 0) {
				await tx.stopList.upsert({
					where: { idDish_type: { idDish: dish.id, type: StopType.AUTO } },
					create: { idDish: dish.id, type: StopType.AUTO },
					update: {}
				})
			} else {
				await tx.stopList.deleteMany({
					where: { idDish: dish.id, type: StopType.AUTO }
				})
			}
		}
	}
}
