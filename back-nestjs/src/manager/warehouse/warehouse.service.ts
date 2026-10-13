import {
	ConflictException,
	Injectable,
	NotFoundException
} from '@nestjs/common'
import { Prisma, StopType } from '@prisma/client'
import {
	availableStock,
	countPortions,
	inventoryTransaction,
	OPEN_STOP,
	refreshAutoStops
} from '../../inventory/availability'
import {
	type BatchStatus,
	batchStatus,
	type ExpiryPolicy,
	usableAfter
} from '../../inventory/expiry'
import { loadExpiryPolicy } from '../../inventory/policy'
import { PrismaService } from '../../prisma.service'
import { WarehousePageDto, WarehouseQueryDto } from './warehouse.dto'

const PAGE_SIZE = 25
const SIGNAL_LIMIT = 50
const batchSelect = {
	id: true,
	count: true,
	receivedCount: true,
	EXP: true,
	product: {
		select: { id: true, nameProduct: true, unit: { select: { name: true } } }
	},
	delivery: {
		select: {
			id: true,
			number: true,
			createDate: true,
			supplier: { select: { name: true } }
		}
	}
} satisfies Prisma.BatchSelect
type Batch = Prisma.BatchGetPayload<{ select: typeof batchSelect }>

// Тот же порядок, что при списании по заказу: срок, потом дата приёмки, потом id
const FEFO_ORDER = [
	{ EXP: 'asc' },
	{ delivery: { createDate: 'asc' } },
	{ id: 'asc' }
] satisfies Prisma.BatchOrderByWithRelationInput[]

// «Истекает» — срочные партии и те, из которых уже нельзя готовить
const EXPIRING: BatchStatus[] = ['urgent', 'unusable']

// Дальше этой границы партия не может быть ни срочной, ни «нельзя готовить»
const expiringHorizon = (now: Date, policy: ExpiryPolicy) =>
	new Date(
		now.getTime() + Math.max(policy.urgentMaxMs, policy.cookReserveMs)
	)

@Injectable()
export class ManagerWarehouseService {
	constructor(private readonly prisma: PrismaService) {}

	// Непросроченные партии с остатком, которые уже попали в «Истекает»
	private async expiringBatches(
		tx: Prisma.TransactionClient,
		now: Date,
		policy: ExpiryPolicy,
		productIds?: string[]
	) {
		const rows = await tx.batch.findMany({
			where: {
				...(productIds ? { idProduct: { in: productIds } } : {}),
				count: { gt: 0 },
				EXP: { gt: now, lte: expiringHorizon(now, policy) }
			},
			select: batchSelect,
			orderBy: FEFO_ORDER
		})
		return rows.filter((row) =>
			EXPIRING.includes(
				batchStatus(row.EXP, row.delivery.createDate, now, policy)
			)
		)
	}

	async products(query: WarehouseQueryDto) {
		return this.prisma.$transaction(
			async (tx) => {
				const asOf = new Date()
				const policy = await loadExpiryPolicy(tx)
				const expiringIds =
					query.expiringOnly === 'true'
						? [
								...new Set(
									(await this.expiringBatches(tx, asOf, policy)).map(
										(row) => row.product.id
									)
								)
							]
						: null
				const where: Prisma.ProductWhereInput = {
					...(query.search
						? {
								AND: query.search
									.split(' ')
									.filter(Boolean)
									.map((word) => ({
										nameProduct: {
											contains: word,
											mode: Prisma.QueryMode.insensitive
										}
									}))
							}
						: {}),
					...(expiringIds ? { id: { in: expiringIds } } : {})
				}
				const rows = await tx.product.findMany({
					where,
					orderBy: [{ nameProduct: 'asc' }, { id: 'asc' }],
					skip: (query.page - 1) * PAGE_SIZE,
					take: PAGE_SIZE,
					select: {
						id: true,
						nameProduct: true,
						unit: { select: { name: true } },
						_count: { select: { batches: { where: { count: { gt: 0 } } } } }
					}
				})
				const ids = rows.map((row) => row.id),
					stock = await availableStock(tx, asOf, ids, policy)
				const good = await tx.batch.groupBy({
					by: ['idProduct'],
					where: {
						idProduct: { in: ids },
						count: { gt: 0 },
						EXP: { gt: asOf }
					},
					_min: { EXP: true }
				})
				const expired = await tx.batch.groupBy({
					by: ['idProduct'],
					where: {
						idProduct: { in: ids },
						count: { gt: 0 },
						EXP: { lte: asOf }
					},
					_sum: { count: true },
					_min: { EXP: true }
				})
				const soonIds = new Set(
					(await this.expiringBatches(tx, asOf, policy, ids)).map(
						(row) => row.product.id
					)
				)
				const goodDates = new Map(
						good.map((row) => [row.idProduct, row._min.EXP])
					),
					expiredRows = new Map(expired.map((row) => [row.idProduct, row]))
				return {
					items: rows.map((row) => ({
						id: row.id,
						name: row.nameProduct,
						unit: row.unit.name,
						// Годный остаток: только партии, из которых ещё успеют приготовить
						availableQuantity: (
							stock.get(row.id) ?? new Prisma.Decimal(0)
						).toFixed(3),
						expiredQuantity: (
							expiredRows.get(row.id)?._sum.count ?? new Prisma.Decimal(0)
						).toFixed(3),
						batchesCount: row._count.batches,
						nearestExpiry:
							goodDates.get(row.id) ??
							expiredRows.get(row.id)?._min.EXP ??
							null,
						nearestExpired: !goodDates.has(row.id) && expiredRows.has(row.id),
						hasExpired: expiredRows.has(row.id),
						expiring: soonIds.has(row.id)
					})),
					total: await tx.product.count({ where }),
					page: query.page,
					pageSize: PAGE_SIZE,
					generatedAt: asOf.toISOString()
				}
			},
			{ isolationLevel: 'RepeatableRead' }
		)
	}

	async batches(productId: string, query: WarehousePageDto) {
		return this.prisma.$transaction(
			async (tx) => {
				const product = await tx.product.findUnique({
					where: { id: productId },
					select: {
						id: true,
						nameProduct: true,
						unit: { select: { name: true } }
					}
				})
				if (!product) throw new NotFoundException('Продукт не найден')
				const asOf = new Date(),
					policy = await loadExpiryPolicy(tx),
					usableFrom = usableAfter(asOf, policy),
					base = { idProduct: productId, count: { gt: 0 } },
					goodWhere = { ...base, EXP: { gt: asOf } },
					expiredWhere = { ...base, EXP: { lte: asOf } }
				const goodCount = await tx.batch.count({ where: goodWhere }),
					// Непросроченные, но уже не для готовки: по сроку они идут первыми
					unusableCount = await tx.batch.count({
						where: { ...base, EXP: { gt: asOf, lte: usableFrom } }
					}),
					expiredCount = await tx.batch.count({ where: expiredWhere }),
					offset = (query.page - 1) * PAGE_SIZE
				const goodRows =
					offset < goodCount
						? await tx.batch.findMany({
								where: goodWhere,
								select: batchSelect,
								orderBy: FEFO_ORDER,
								skip: offset,
								take: PAGE_SIZE
							})
						: []
				const expiredRows =
					goodRows.length < PAGE_SIZE
						? await tx.batch.findMany({
								where: expiredWhere,
								select: batchSelect,
								orderBy: FEFO_ORDER,
								skip: Math.max(0, offset - goodCount),
								take: PAGE_SIZE - goodRows.length
							})
						: []
				return {
					product: {
						id: product.id,
						name: product.nameProduct,
						unit: product.unit.name
					},
					items: [
						...goodRows.map((row, index) => {
							const batch = this.batch(row, asOf, policy)
							const position = offset + index
							return {
								...batch,
								// Номер в очереди FEFO — только среди партий, из которых готовят
								fefoRank:
									batch.status === 'unusable'
										? null
										: position - unusableCount + 1
							}
						}),
						...expiredRows.map((row) => ({
							...this.batch(row, asOf, policy),
							fefoRank: null
						}))
					],
					total: goodCount + expiredCount,
					goodCount: goodCount - unusableCount,
					unusableCount,
					expiredCount,
					page: query.page,
					pageSize: PAGE_SIZE,
					generatedAt: asOf.toISOString()
				}
			},
			{ isolationLevel: 'RepeatableRead' }
		)
	}

	async signals(userId: string) {
		return this.prisma.$transaction(
			async (tx) => {
				const asOf = new Date()
				const policy = await loadExpiryPolicy(tx)
				const expiredWhere = { count: { gt: 0 }, EXP: { lte: asOf } }
				const soon = await this.expiringBatches(tx, asOf, policy)
				const expired = await tx.batch.findMany({
					where: expiredWhere,
					select: batchSelect,
					orderBy: FEFO_ORDER,
					take: SIGNAL_LIMIT
				})
				// Что система списала сама: непрочитанные сообщения этого менеджера
				const autoWhere = {
					idRecipient: userId,
					isRead: false,
					stockMovement: { createrId: null, idOrder: null }
				} satisfies Prisma.MessageWhereInput
				const autoWrittenOff = await tx.message.findMany({
					where: autoWhere,
					orderBy: [{ createDate: 'desc' }, { id: 'asc' }],
					take: SIGNAL_LIMIT,
					select: {
						id: true,
						createDate: true,
						stockMovement: {
							select: { count: true, batch: { select: batchSelect } }
						}
					}
				})
				const dishes = await tx.dish.findMany({
					where: { deletedAt: null },
					orderBy: [{ name: 'asc' }, { id: 'asc' }],
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
						stopLists: { where: OPEN_STOP, select: { type: true } }
					}
				})
				const stock = await availableStock(
					tx,
					asOf,
					[
						...new Set(
							dishes.flatMap((dish) =>
								dish.ingredients.map((item) => item.idProduct)
							)
						)
					],
					policy
				)
				const stopped = dishes
					.map((dish) => ({
						id: dish.id,
						name: dish.name,
						autoStop:
							countPortions(dish.ingredients, stock) === 0 ||
							dish.stopLists.some((stop) => stop.type === StopType.AUTO),
						manualStop: dish.stopLists.some(
							(stop) => stop.type === StopType.MANUAL
						),
						missing: dish.ingredients
							.filter((item) =>
								(stock.get(item.idProduct) ?? new Prisma.Decimal(0)).lt(
									item.count
								)
							)
							.map((item) => item.product.nameProduct)
					}))
					.filter((dish) => dish.autoStop || dish.manualStop)
				return {
					expiring: {
						items: soon
							.slice(0, SIGNAL_LIMIT)
							.map((row) => this.batch(row, asOf, policy)),
						total: soon.length
					},
					expired: {
						items: expired.map((row) => this.batch(row, asOf, policy)),
						total: await tx.batch.count({ where: expiredWhere })
					},
					autoWrittenOff: {
						items: autoWrittenOff.flatMap((message) =>
							message.stockMovement
								? [
										{
											messageId: message.id,
											writtenOffAt: message.createDate.toISOString(),
											quantity: message.stockMovement.count.toFixed(3),
											batch: this.batch(
												message.stockMovement.batch,
												asOf,
												policy
											)
										}
									]
								: []
						),
						total: await tx.message.count({ where: autoWhere })
					},
					stopped: {
						items: stopped.slice(0, SIGNAL_LIMIT),
						total: stopped.length
					},
					limit: SIGNAL_LIMIT,
					generatedAt: asOf.toISOString()
				}
			},
			{ isolationLevel: 'RepeatableRead' }
		)
	}

	/**
	 * Менеджер списывает партию целиком — так убирают партии, из которых кухне
	 * готовить уже нельзя. Движение с автором и без заказа: ручное списание
	 */
	async writeOffBatch(userId: string, batchId: string) {
		return inventoryTransaction(this.prisma, async (tx) => {
			const now = new Date()
			const policy = await loadExpiryPolicy(tx)
			const batch = await tx.batch.findUnique({
				where: { id: batchId },
				select: { count: true, idProduct: true }
			})
			if (!batch) throw new NotFoundException('Партия не найдена')
			if (batch.count.lte(0))
				throw new ConflictException('Партия уже пуста — обновите склад')

			const updated = await tx.batch.updateMany({
				where: { id: batchId, count: batch.count },
				data: { count: 0 }
			})
			if (!updated.count)
				throw new ConflictException('Остаток партии изменился — обновите склад')

			await tx.stockMovement.create({
				data: {
					idBatch: batchId,
					count: batch.count,
					createrId: userId,
					createDate: now
				}
			})
			await refreshAutoStops(
				tx,
				{ ingredients: { some: { idProduct: batch.idProduct } } },
				now,
				policy
			)
			return { writtenOff: batch.count.toFixed(3) }
		})
	}

	// «Понятно» на сообщении об автосписании: убирает его из сигналов этого менеджера
	async readMessages(userId: string, ids: string[]) {
		const { count } = await this.prisma.message.updateMany({
			where: { id: { in: ids }, idRecipient: userId },
			data: { isRead: true }
		})
		return { read: count }
	}

	private batch(row: Batch, asOf: Date, policy: ExpiryPolicy) {
		const status = batchStatus(row.EXP, row.delivery.createDate, asOf, policy)
		return {
			id: row.id,
			productId: row.product.id,
			productName: row.product.nameProduct,
			unit: row.product.unit.name,
			quantity: row.count.toFixed(3),
			receivedQuantity: row.receivedCount?.toFixed(3) ?? null,
			expiresAt: row.EXP.toISOString(),
			// Статус решает только сервер; «осталось» фронт отсчитывает сам от серверного времени
			status,
			expired: status === 'expired',
			delivery: row.delivery
		}
	}
}
