import { PrismaService } from '@/prisma.service'
import {
	BadRequestException,
	Injectable,
	NotFoundException
} from '@nestjs/common'
import { Prisma, RejectionReason, StopType } from '@prisma/client'
import { CreateOrderDto } from './dto/create-order.dto'
import {
	BUSY_MESSAGE,
	countPortions,
	inventoryTransaction,
	OPEN_STOP,
	refreshAutoStops
} from '../inventory/availability'
import { allocateFefo } from '../inventory/fefo'
import {
	HotOffersService,
	type MenuSettings
} from '../inventory/hot-offers.service'
import {
	findShortages,
	mergeOrderLines,
	type OrderLine,
	orderNeed
} from '../inventory/order-need'
import { usableAfter } from '../inventory/expiry'
import { loadExpiryPolicy } from '../inventory/policy'
import { SettingsService } from '../settings/settings.service'
import { nextOrderNumber } from './order-number'
import { OrderRejectedException, recordRejection } from './order-rejection'

type Tx = Prisma.TransactionClient
type Db = Tx | PrismaService
type Decimal = Prisma.Decimal

const ZERO = new Prisma.Decimal(0)

@Injectable()
export class WaiterService {
	constructor(
		private prisma: PrismaService,
		private settings: SettingsService,
		private hotOffers: HotOffersService
	) {}

	async getMenu() {
		const rows = await this.prisma.$transaction(
			(tx) => this.hotOffers.build(tx),
			{ isolationLevel: 'RepeatableRead' }
		)
		// Официанту — только отметка «горячее», без объяснения
		return rows.map(({ score, reasons, salesPerDay, ...dish }) => dish)
	}

	async hotPreview(overrides: Partial<MenuSettings>) {
		const settings = { ...(await this.settings.get()), ...overrides }
		return this.prisma.$transaction(
			(tx) => this.hotOffers.preview(tx, settings),
			{ isolationLevel: 'RepeatableRead' }
		)
	}

	async createOrder(userId: string, dto: CreateOrderDto) {
		const lines = mergeOrderLines(dto.items)
		try {
			return await inventoryTransaction(
				this.prisma,
				(tx) => this.placeOrder(tx, userId, lines),
				() => new OrderRejectedException(RejectionReason.BUSY, BUSY_MESSAGE)
			)
		} catch (error) {
			// Отказ — в журнал менеджера; ошибки данных («обновите меню») туда не пишутся
			if (error instanceof OrderRejectedException)
				await recordRejection(this.prisma, userId, lines, error)
			throw error
		}
	}

	/**
	 * Финальная проверка и атомарное списание: весь заказ или ничего.
	 * Блюдо в ручном стопе или нехватка годного остатка — отказ, склад не тронут
	 */
	private async placeOrder(tx: Tx, userId: string, lines: OrderLine[]) {
		const now = new Date()
		const policy = await loadExpiryPolicy(tx)
		// Из партий, которые истекут раньше, чем успеют приготовить, не списываем
		const usableFrom = usableAfter(now, policy)
		const dishIds = [...new Set(lines.map((line) => line.dishId))]

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
				// Авто-стоп проверяет сам расчёт нехватки ниже, здесь — только ручной
				stopLists: {
					where: { type: StopType.MANUAL, ...OPEN_STOP },
					select: { type: true }
				}
			}
		})
		if (dishes.length !== dishIds.length) {
			throw new NotFoundException('Блюдо не найдено — обновите меню')
		}

		const withoutRecipe = dishes.filter((dish) => !dish.ingredients.length)
		if (withoutRecipe.length) {
			throw new BadRequestException(
				`У блюда не задан состав: ${withoutRecipe.map((d) => d.name).join(', ')}`
			)
		}

		const dishById = new Map(dishes.map((dish) => [dish.id, dish]))
		for (const line of lines) {
			const dish = dishById.get(line.dishId)!
			const recipe = new Set(dish.ingredients.map((i) => i.idProduct))
			if (line.excluded.some((id) => !recipe.has(id))) {
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
			...new Set(dishes.flatMap((d) => d.ingredients.map((i) => i.idProduct)))
		]
		const batches = await this.getUsableBatches(tx, usableFrom, productIds)
		const stock = this.sumStock(batches)

		const availablePortions = () =>
			dishes.map((dish) => ({
				dishId: dish.id,
				name: dish.name,
				portions:
					dish.stopLists.length > 0 ? 0 : countPortions(dish.ingredients, stock)
			}))

		const stopped = dishes.filter((dish) => dish.stopLists.length > 0)
		if (stopped.length) {
			throw new OrderRejectedException(
				RejectionReason.STOP_LIST,
				{
					message: 'Заказ не принят: блюдо в стоп-листе',
					stopped: stopped.map((dish) => dish.name),
					shortages: [],
					available: availablePortions()
				},
				stopped.map((dish) => dish.id)
			)
		}

		const need = orderNeed(lines, dishById)
		const shortages = findShortages(need, stock)
		if (shortages.length) {
			// Блюда, которым не хватило продукта (с учётом того, что гость просил убрать)
			const short = new Set(
				[...need]
					.filter(([productId, entry]) =>
						(stock.get(productId) ?? ZERO).lt(entry.amount)
					)
					.map(([productId]) => productId)
			)
			const blocked = lines
				.filter((line) =>
					dishById
						.get(line.dishId)!
						.ingredients.some(
							(i) =>
								short.has(i.idProduct) && !line.excluded.includes(i.idProduct)
						)
				)
				.map((line) => line.dishId)
			throw new OrderRejectedException(
				RejectionReason.SHORTAGE,
				{
					message: 'Заказ не принят: не хватает продуктов',
					stopped: [],
					shortages,
					available: availablePortions()
				},
				[...new Set(blocked)]
			)
		}

		const takes = allocateFefo(
			batches.map((batch) => ({
				id: batch.id,
				idProduct: batch.idProduct,
				count: batch.count,
				EXP: batch.EXP,
				receivedAt: batch.delivery.createDate
			})),
			new Map([...need].map(([productId, entry]) => [productId, entry.amount]))
		)
		// После проверки нехватки так быть не может — значит, остатки меняются прямо сейчас
		if (!takes)
			throw new OrderRejectedException(RejectionReason.BUSY, BUSY_MESSAGE)

		// Номер — следующий за последним заказом. Два заказа одновременно прочитают
		// одного и того же «последнего» — Serializable откатит один, и он возьмёт следующий
		const last = await tx.order.findFirst({
			orderBy: [{ createDate: 'desc' }, { id: 'desc' }],
			select: { number: true }
		})
		const order = await tx.order.create({
			data: {
				createrId: userId,
				createDate: now,
				number: nextOrderNumber(last?.number ?? null),
				items: {
					create: lines.map((line) => ({
						idDish: line.dishId,
						count: line.count,
						exclusions: {
							create: line.excluded.map((idProduct) => ({ idProduct }))
						}
					}))
				}
			},
			select: { id: true, number: true, createDate: true }
		})

		for (const { batchId, take } of takes) {
			// Условное списание: партия всё ещё годна и в ней хватает остатка —
			// иначе откатывается весь заказ, остаток не уходит в минус
			const updated = await tx.batch.updateMany({
				where: { id: batchId, count: { gte: take }, EXP: { gt: usableFrom } },
				data: { count: { decrement: take } }
			})
			if (updated.count === 0) {
				throw new OrderRejectedException(RejectionReason.BUSY, BUSY_MESSAGE)
			}
			await tx.stockMovement.create({
				data: {
					idBatch: batchId,
					count: take,
					idOrder: order.id,
					createrId: userId
				}
			})
		}

		await refreshAutoStops(
			tx,
			{ ingredients: { some: { idProduct: { in: productIds } } } },
			now,
			policy
		)

		return order
	}

	// Годные для готовки партии в порядке FEFO: срок позже «сейчас + запас»;
	// при равных сроках раньше идёт то, что раньше принято
	private getUsableBatches(db: Db, usableFrom: Date, productIds?: string[]) {
		return db.batch.findMany({
			where: {
				EXP: { gt: usableFrom },
				count: { gt: 0 },
				...(productIds && { idProduct: { in: productIds } })
			},
			orderBy: [
				{ EXP: 'asc' },
				{ delivery: { createDate: 'asc' } },
				{ id: 'asc' }
			],
			select: {
				id: true,
				idProduct: true,
				count: true,
				EXP: true,
				delivery: { select: { createDate: true } }
			}
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
