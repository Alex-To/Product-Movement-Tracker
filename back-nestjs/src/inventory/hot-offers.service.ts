import { BadRequestException, Injectable } from '@nestjs/common'
import { Prisma, RejectionReason, StopType } from '@prisma/client'
import { PrismaService } from '../prisma.service'
import { DEFAULT_SETTINGS } from '../settings/settings.defaults'
import { countPortions, OPEN_STOP } from './availability'
import { collectDemand, type DemandEvent, salesRatePerHour } from './demand'
import {
	expiryPolicy,
	type ExpirySettings,
	HOUR_MS,
	usableAfter
} from './expiry'
import { compareByPriority, type HotBatch, scoreDish } from './hot-offers'
import { selectHotOffers } from './hot-selection'

type Db = Prisma.TransactionClient | PrismaService
type Decimal = Prisma.Decimal
const ZERO = new Prisma.Decimal(0)
const PREVIEW_EXTRA = 5
export type MenuSettings = ExpirySettings & {
	hotLimit: number
	demandDays: number
}
type StoredRejectionLine = { dishId?: string; count: number; blocked?: boolean }

// One selection for the waiter, manager catalog, and settings preview.
@Injectable()
export class HotOffersService {
	async preview(db: Db, settings: MenuSettings, now = new Date()) {
		if (settings.urgentMaxHours < settings.urgentMinHours)
			throw new BadRequestException(
				'Верхняя граница срочности не может быть меньше нижней'
			)
		const rows = await this.build(db, now, settings)
		const candidates = rows
			.filter(
				(dish) => !dish.isStopped && !dish.manualHotActive && dish.score > 0
			)
			.sort(compareByPriority)
		const manual = rows.filter((dish) => dish.hotSource === 'MANUAL')
		return {
			generatedAt: now.toISOString(),
			hotLimit: settings.hotLimit,
			demandDays: settings.demandDays,
			// Нет ни заказов, ни отказов за период — считаем «продадут все N»
			hasDemand: rows.some((dish) => dish.salesPerDay !== null),
			candidates: candidates.length,
			manualCount: manual.length,
			// Горячие и несколько следующих — чтобы было видно, кто на подходе
			items: [
				...manual,
				...candidates.slice(0, settings.hotLimit + PREVIEW_EXTRA)
			].map((dish) => ({
				id: dish.id,
				name: dish.name,
				portions: dish.portions,
				isHot: dish.isHot,
				hotSource: dish.hotSource,
				manualHotUntil: dish.manualHotUntil,
				manualHotActive: dish.manualHotActive,
				// Три значащие цифры: у редко заказываемых блюд приоритет бывает 0,0004 — это не ноль
				score: Number(dish.score.toPrecision(3)),
				salesPerDay:
					dish.salesPerDay === null
						? null
						: Math.round(dish.salesPerDay * 10) / 10,
				reasons: dish.reasons.slice(0, 3)
			}))
		}
	}

	async build(db: Db, now = new Date(), suppliedSettings?: MenuSettings) {
		const settings =
			suppliedSettings ??
			(await db.settings.findUnique({ where: { id: 1 } })) ??
			DEFAULT_SETTINGS
		const policy = expiryPolicy(settings)
		const usableFrom = usableAfter(now, policy)

		const [dishes, batches, demand] = await Promise.all([
			db.dish.findMany({
				where: { deletedAt: null },
				orderBy: { name: 'asc' },
				select: {
					id: true,
					manualHotUntil: true,
					manualHotEnabled: true,
					name: true,
					image: true,
					ingredients: {
						select: {
							idProduct: true,
							count: true,
							product: {
								select: { nameProduct: true, unit: { select: { name: true } } }
							}
						}
					},
					stopLists: { where: OPEN_STOP, select: { type: true } }
				}
			}),
			this.getUsableBatches(db, usableFrom),
			this.loadDemand(db, settings.demandDays, now)
		])

		const stock = this.sumStock(batches)
		const batchesByProduct = new Map<string, HotBatch[]>()
		for (const batch of batches) {
			const list = batchesByProduct.get(batch.idProduct) ?? []
			list.push({
				idProduct: batch.idProduct,
				count: batch.count,
				EXP: batch.EXP,
				receivedAt: batch.delivery.createDate
			})
			batchesByProduct.set(batch.idProduct, list)
		}

		const menu = dishes.map((dish) => {
			const portions = countPortions(dish.ingredients, stock)
			// Стоп — открытые записи стоп-листа. Авто-стоп ставят движения склада и таймер
			// сроков; страховка на случай, если запись ещё не успела появиться
			const stops = [
				...new Set([
					...dish.stopLists.map((stop) => stop.type),
					...(portions === 0 ? [StopType.AUTO] : [])
				])
			]
			const isStopped = stops.length > 0 || !dish.ingredients.length
			const { score, reasons, salesPerDay } = isStopped
				? { score: 0, reasons: [], salesPerDay: null }
				: scoreDish(
						{
							id: dish.id,
							name: dish.name,
							portions,
							ingredients: dish.ingredients.map((i) => ({
								idProduct: i.idProduct,
								count: i.count,
								productName: i.product.nameProduct,
								unit: i.product.unit.name
							}))
						},
						batchesByProduct,
						now,
						policy,
						salesRatePerHour(demand, dish.id)
					)

			return {
				id: dish.id,
				manualHotUntil: dish.manualHotUntil?.toISOString() ?? null,
				manualHotEnabled: dish.manualHotEnabled,
				name: dish.name,
				image: dish.image,
				portions,
				hasRecipe: dish.ingredients.length > 0,
				// Фронту для проверки всего чека: у разных блюд бывают общие продукты
				ingredients: dish.ingredients.map((i) => ({
					productId: i.idProduct,
					name: i.product.nameProduct,
					perPortion: i.count.toString(),
					available: (stock.get(i.idProduct) ?? ZERO).toString()
				})),
				stops,
				missing: dish.ingredients
					.filter((i) => (stock.get(i.idProduct) ?? ZERO).lt(i.count))
					.map((i) => i.product.nameProduct),
				isStopped,
				score,
				reasons,
				salesPerDay
			}
		})

		return selectHotOffers(menu, settings.hotLimit, now)
	}

	private async loadDemand(db: Db, demandDays: number, now: Date) {
		const since = new Date(now.getTime() - demandDays * 24 * HOUR_MS)
		const [items, rejections] = await Promise.all([
			db.orderItem.findMany({
				where: { order: { createDate: { gte: since } } },
				select: {
					idDish: true,
					count: true,
					order: { select: { createDate: true } }
				}
			}),
			db.orderRejection.findMany({
				where: {
					createDate: { gte: since },
					reason: { in: [RejectionReason.STOP_LIST, RejectionReason.SHORTAGE] }
				},
				select: { createDate: true, lines: true }
			})
		])
		const events: DemandEvent[] = items.map((item) => ({
			dishId: item.idDish,
			portions: item.count,
			at: item.order.createDate
		}))
		for (const rejection of rejections)
			for (const line of rejection.lines as StoredRejectionLine[])
				if (line.blocked && line.dishId)
					events.push({
						dishId: line.dishId,
						portions: line.count,
						at: rejection.createDate
					})
		return collectDemand(events, since, now)
	}

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
