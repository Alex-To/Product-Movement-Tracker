import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma.service'
import { DemandEvent } from '../../inventory/demand'
import { expiryPolicy, HOUR_MS } from '../../inventory/expiry'
import { forecastProduct } from '../../inventory/forecast'
import { DEFAULT_SETTINGS } from '../../settings/settings.defaults'
import { StatisticsQueryDto } from './statistics.dto'
import { statisticsPeriod, STATISTICS_TIME_ZONE } from './statistics.period'
import { ForecastQueryDto } from './stock-statistics.dto'

@Injectable()
export class StockStatisticsService {
	constructor(private readonly prisma: PrismaService) {}

	async forecast(query: ForecastQueryDto) {
		const now = new Date()
		return this.prisma.$transaction(
			async (tx) => {
				const settings =
					(await tx.settings.findUnique({ where: { id: 1 } })) ??
					DEFAULT_SETTINGS
				const [history] = await tx.$queryRaw<
					Array<{ from: Date; until: Date }>
				>`
					WITH boundary AS (
						SELECT (CAST(${now.toISOString()} AS timestamptz) AT TIME ZONE ${STATISTICS_TIME_ZONE})::date AS today
					)
					SELECT ((today - ${settings.demandDays}::integer)::timestamp AT TIME ZONE ${STATISTICS_TIME_ZONE}) AT TIME ZONE 'UTC' AS "from",
					       (today::timestamp AT TIME ZONE ${STATISTICS_TIME_ZONE}) AT TIME ZONE 'UTC' AS until
					FROM boundary
				`
				const products = await tx.product.findMany({
					orderBy: [{ nameProduct: 'asc' }, { id: 'asc' }],
					include: {
						unit: true,
						batches: {
							where: { count: { gt: 0 } },
							include: { delivery: { select: { createDate: true } } }
						}
					}
				})
				const dishes = await tx.dish.findMany({
					where: { deletedAt: null },
					select: {
						id: true,
						ingredients: { select: { idProduct: true, count: true } }
					}
				})
				const active = new Set(
					dishes.filter((d) => d.ingredients.length).map((d) => d.id)
				)
				const items = await tx.orderItem.findMany({
					where: {
						idDish: { in: [...active] },
						order: { createDate: { gte: history.from, lt: history.until } }
					},
					select: {
						idDish: true,
						count: true,
						order: { select: { createDate: true } }
					}
				})
				const events: DemandEvent[] = items.map((item) => ({
					dishId: item.idDish,
					portions: item.count,
					at: item.order.createDate
				}))
				if (query.includeRejections === 'true') {
					const refused = await tx.orderRejection.findMany({
						where: {
							reason: { in: ['STOP_LIST', 'SHORTAGE'] },
							createDate: { gte: history.from, lt: history.until }
						},
						select: { lines: true, createDate: true }
					})
					for (const row of refused)
						if (Array.isArray(row.lines))
							for (const line of row.lines) {
								if (!line || typeof line !== 'object' || Array.isArray(line))
									continue
								if (
									line.blocked === true &&
									typeof line.dishId === 'string' &&
									active.has(line.dishId) &&
									typeof line.count === 'number' &&
									Number.isSafeInteger(line.count) &&
									line.count > 0
								)
									events.push({
										dishId: line.dishId,
										portions: line.count,
										at: row.createDate
									})
							}
				}
				const portionsByDish = new Map<string, number>()
				for (const event of events)
					if (event.portions > 0)
						portionsByDish.set(
							event.dishId,
							(portionsByDish.get(event.dishId) ?? 0) + event.portions
						)
				const periodHours = settings.demandDays * 24
				const rates = new Map<string, Prisma.Decimal>()
				// Unlike hot-offer ranking, procurement does not invent a sale for unseen dishes.
				// Current recipes convert observed portions into a shared product demand.
				for (const dish of dishes) {
					const portions = portionsByDish.get(dish.id)
					if (!portions) continue
					for (const ingredient of dish.ingredients) {
						const amount = ingredient.count.mul(portions).div(periodHours)
						rates.set(
							ingredient.idProduct,
							(rates.get(ingredient.idProduct) ?? new Prisma.Decimal(0)).plus(
								amount
							)
						)
					}
				}
				return {
					generatedAt: now.toISOString(),
					until: new Date(
						now.getTime() + query.days * 24 * HOUR_MS
					).toISOString(),
					days: query.days,
					demandDays: settings.demandDays,
					observationHours: portionsByDish.size ? periodHours : null,
					historyFrom: history.from.toISOString(),
					historyUntil: history.until.toISOString(),
					includeRejections: query.includeRejections === 'true',
					cookReserveMinutes: settings.cookReserveMinutes,
					products: products.map((product) => ({
						id: product.id,
						name: product.nameProduct,
						unitId: product.idUnit,
						unit: product.unit.name,
						...forecastProduct(
							product.batches.map((batch) => ({
								id: batch.id,
								idProduct: product.id,
								count: batch.count,
								EXP: batch.EXP,
								receivedAt: batch.delivery.createDate
							})),
							rates.get(product.id) ?? null,
							now,
							query.days,
							expiryPolicy(settings),
							product.unit.name
						)
					}))
				}
			},
			{ isolationLevel: 'RepeatableRead', timeout: 15000 }
		)
	}

	async expiry(query: StatisticsQueryDto) {
		const period = statisticsPeriod(query)
		return this.prisma.$transaction(
			async (tx) => {
				const [range] = await tx.$queryRaw<
					Array<{ from: Date; until: Date }>
				>`SELECT (CAST(${query.from} AS date)::timestamp AT TIME ZONE ${STATISTICS_TIME_ZONE}) AT TIME ZONE 'UTC' AS "from", ((CAST(${query.to} AS date) + interval '1 day')::timestamp AT TIME ZONE ${STATISTICS_TIME_ZONE}) AT TIME ZONE 'UTC' AS until`
				const rows = await tx.stockMovement.findMany({
					where: {
						idOrder: null,
						count: { gt: 0 },
						createDate: { gte: range.from, lt: range.until }
					},
					select: {
						idBatch: true,
						count: true,
						createDate: true,
						createrId: true,
						batch: {
							select: {
								EXP: true,
								product: {
									select: {
										id: true,
										nameProduct: true,
										idUnit: true,
										unit: { select: { name: true } }
									}
								}
							}
						}
					}
				})
				type Totals = {
					auto: Prisma.Decimal
					manualExpired: Prisma.Decimal
					otherManual: Prisma.Decimal
				}
				const zero = (): Totals => ({
					auto: new Prisma.Decimal(0),
					manualExpired: new Prisma.Decimal(0),
					otherManual: new Prisma.Decimal(0)
				})
				const units = new Map<
					string,
					{
						id: string
						name: string
						products: Map<
							string,
							Totals & { id: string; name: string; batches: Set<string> }
						>
						series: Map<string, Totals>
					}
				>()
				const formatter = new Intl.DateTimeFormat('en-CA', {
					timeZone: STATISTICS_TIME_ZONE,
					year: 'numeric',
					month: '2-digit',
					day: '2-digit',
					hour: '2-digit',
					hourCycle: 'h23'
				})
				for (const row of rows) {
					const product = row.batch.product
					const unit = units.get(product.idUnit) ?? {
						id: product.idUnit,
						name: product.unit.name,
						products: new Map(),
						series: new Map(period.keys.map((key) => [key, zero()]))
					}
					const item = unit.products.get(product.id) ?? {
						id: product.id,
						name: product.nameProduct,
						batches: new Set<string>(),
						...zero()
					}
					const kind =
						row.createrId === null
							? 'auto'
							: row.batch.EXP <= row.createDate
								? 'manualExpired'
								: 'otherManual'
					item[kind] = item[kind].plus(row.count)
					item.batches.add(row.idBatch)
					const parts = Object.fromEntries(
						formatter
							.formatToParts(row.createDate)
							.map((part) => [part.type, part.value])
					)
					const key =
						period.bucket === 'hour'
							? `${parts.hour}:00`
							: `${parts.year}-${parts.month}-${parts.day}`
					const bucket = unit.series.get(key)!
					bucket[kind] = bucket[kind].plus(row.count)
					unit.products.set(product.id, item)
					units.set(unit.id, unit)
				}
				const totals = (value: Totals) => ({
					auto: value.auto.toFixed(3),
					manualExpired: value.manualExpired.toFixed(3),
					otherManual: value.otherManual.toFixed(3)
				})
				return {
					period,
					generatedAt: new Date().toISOString(),
					movements: rows.length,
					batches: new Set(rows.map((row) => row.idBatch)).size,
					units: [...units.values()]
						.sort((a, b) => a.name.localeCompare(b.name))
						.map((unit) => ({
							id: unit.id,
							name: unit.name,
							products: [...unit.products.values()]
								.map((item) => ({
									id: item.id,
									name: item.name,
									batches: item.batches.size,
									...totals(item)
								}))
								.sort(
									(a, b) =>
										Number(b.auto) - Number(a.auto) ||
										a.name.localeCompare(b.name)
								),
							series: [...unit.series].map(([key, value]) => ({
								key,
								...totals(value)
							}))
						}))
				}
			},
			{ isolationLevel: 'RepeatableRead', timeout: 15000 }
		)
	}
}
