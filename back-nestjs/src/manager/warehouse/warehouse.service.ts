import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { availableStock, countPortions } from '../../inventory/availability'
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
@Injectable()
export class ManagerWarehouseService {
	constructor(private readonly prisma: PrismaService) {}
	async products(query: WarehouseQueryDto) {
		return this.prisma.$transaction(
			async (tx) => {
				const asOf = new Date(),
					threshold = new Date(asOf.getTime() + 86400000)
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
					...(query.expiringOnly === 'true'
						? {
								batches: {
									some: { count: { gt: 0 }, EXP: { gt: asOf, lte: threshold } }
								}
							}
						: {})
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
					stock = await availableStock(tx, asOf, ids)
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
				const soon = await tx.batch.groupBy({
					by: ['idProduct'],
					where: {
						idProduct: { in: ids },
						count: { gt: 0 },
						EXP: { gt: asOf, lte: threshold }
					}
				})
				const goodDates = new Map(
						good.map((row) => [row.idProduct, row._min.EXP])
					),
					expiredRows = new Map(expired.map((row) => [row.idProduct, row])),
					soonIds = new Set(soon.map((row) => row.idProduct))
				return {
					items: rows.map((row) => ({
						id: row.id,
						name: row.nameProduct,
						unit: row.unit.name,
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
					base = { idProduct: productId, count: { gt: 0 } },
					goodWhere = { ...base, EXP: { gt: asOf } },
					expiredWhere = { ...base, EXP: { lte: asOf } }
				const goodCount = await tx.batch.count({ where: goodWhere }),
					expiredCount = await tx.batch.count({ where: expiredWhere }),
					offset = (query.page - 1) * PAGE_SIZE
				const goodRows =
					offset < goodCount
						? await tx.batch.findMany({
								where: goodWhere,
								select: batchSelect,
								orderBy: [{ EXP: 'asc' }, { id: 'asc' }],
								skip: offset,
								take: PAGE_SIZE
							})
						: []
				const expiredRows =
					goodRows.length < PAGE_SIZE
						? await tx.batch.findMany({
								where: expiredWhere,
								select: batchSelect,
								orderBy: [{ EXP: 'asc' }, { id: 'asc' }],
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
						...goodRows.map((row, index) => ({
							...this.batch(row, asOf),
							fefoRank: offset + index + 1
						})),
						...expiredRows.map((row) => ({
							...this.batch(row, asOf),
							fefoRank: null
						}))
					],
					total: goodCount + expiredCount,
					goodCount,
					expiredCount,
					page: query.page,
					pageSize: PAGE_SIZE,
					generatedAt: asOf.toISOString()
				}
			},
			{ isolationLevel: 'RepeatableRead' }
		)
	}
	async signals() {
		return this.prisma.$transaction(
			async (tx) => {
				const asOf = new Date(),
					threshold = new Date(asOf.getTime() + 86400000)
				const soonWhere = {
						count: { gt: 0 },
						EXP: { gt: asOf, lte: threshold }
					},
					expiredWhere = { count: { gt: 0 }, EXP: { lte: asOf } }
				const soon = await tx.batch.findMany({
					where: soonWhere,
					select: batchSelect,
					orderBy: [{ EXP: 'asc' }, { id: 'asc' }],
					take: SIGNAL_LIMIT
				})
				const expired = await tx.batch.findMany({
					where: expiredWhere,
					select: batchSelect,
					orderBy: [{ EXP: 'asc' }, { id: 'asc' }],
					take: SIGNAL_LIMIT
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
						stopLists: { where: { type: 'MANUAL' }, select: { type: true } }
					}
				})
				const stock = await availableStock(tx, asOf, [
					...new Set(
						dishes.flatMap((dish) =>
							dish.ingredients.map((item) => item.idProduct)
						)
					)
				])
				const stopped = dishes
					.map((dish) => ({
						id: dish.id,
						name: dish.name,
						autoStop: countPortions(dish.ingredients, stock) === 0,
						manualStop: dish.stopLists.length > 0,
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
						items: soon.map((row) => this.batch(row, asOf)),
						total: await tx.batch.count({ where: soonWhere })
					},
					expired: {
						items: expired.map((row) => this.batch(row, asOf)),
						total: await tx.batch.count({ where: expiredWhere })
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
	private batch(row: Batch, asOf: Date) {
		return {
			id: row.id,
			productId: row.product.id,
			productName: row.product.nameProduct,
			unit: row.product.unit.name,
			quantity: row.count.toFixed(3),
			receivedQuantity: row.receivedCount?.toFixed(3) ?? null,
			expiresAt: row.EXP.toISOString(),
			expired: row.EXP <= asOf,
			remainingSeconds: Math.floor((row.EXP.getTime() - asOf.getTime()) / 1000),
			delivery: row.delivery
		}
	}
}
