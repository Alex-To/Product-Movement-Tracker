import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma.service'
import { StatisticsQueryDto } from './statistics.dto'
import { statisticsPeriod, STATISTICS_TIME_ZONE } from './statistics.period'

type SalesRow = {
	dishId: string
	name: string
	archived: boolean
	portions: bigint
	orders: bigint
}
type SalesBucket = { key: string; portions: bigint; orders: bigint }
type RejectionLine = {
	dishId: string
	dishName: string
	count: number
	blocked?: boolean
}
type RefusedDish = {
	dishId: string
	name: string
	portions: number
	attempts: number
	stopList: number
	shortage: number
}

@Injectable()
export class ManagerStatisticsService {
	constructor(private readonly prisma: PrismaService) {}

	async sales(query: StatisticsQueryDto) {
		const period = statisticsPeriod(query)
		return this.prisma.$transaction(
			async (tx) => {
				const range = await this.range(tx, query)
				// Prisma Date parameters use timestamptz; explicit timestamp casts keep
				// UTC storage boundaries independent of the PostgreSQL session timezone.
				const rows = await tx.$queryRaw<SalesRow[]>`
				SELECT d.id_dish AS "dishId", d.name, (d.deleted_at IS NOT NULL) AS archived,
				       sum(oi.count)::bigint AS portions, count(DISTINCT o.id_order)::bigint AS orders
				FROM order_item oi JOIN orders o ON o.id_order = oi.id_order JOIN dishes d ON d.id_dish = oi.id_dish
					WHERE o.create_date >= CAST(${range.from.toISOString()} AS timestamp) AND o.create_date < CAST(${range.until.toISOString()} AS timestamp)
				GROUP BY d.id_dish, d.name, d.deleted_at ORDER BY portions DESC, d.name ASC, d.id_dish ASC
			`
				const format = period.bucket === 'hour' ? 'HH24:00' : 'YYYY-MM-DD'
				const buckets = await tx.$queryRaw<SalesBucket[]>`
				SELECT to_char(timezone(${STATISTICS_TIME_ZONE}, o.create_date AT TIME ZONE 'UTC'), ${format}) AS key,
				       coalesce(sum(oi.count), 0)::bigint AS portions, count(DISTINCT o.id_order)::bigint AS orders
				FROM orders o LEFT JOIN order_item oi ON oi.id_order = o.id_order
					WHERE o.create_date >= CAST(${range.from.toISOString()} AS timestamp) AND o.create_date < CAST(${range.until.toISOString()} AS timestamp) GROUP BY key ORDER BY key
			`
				const byTime = new Map(buckets.map((row) => [row.key, row]))
				const items = rows.map((row) => ({
					dishId: row.dishId,
					name: row.name,
					archived: row.archived,
					portions: Number(row.portions),
					orders: Number(row.orders)
				}))
				return {
					period,
					summary: {
						portions: items.reduce((sum, item) => sum + item.portions, 0),
						orders: buckets.reduce((sum, item) => sum + Number(item.orders), 0),
						dishes: items.length
					},
					dishes: items,
					series: period.keys.map((key) => ({
						key,
						portions: Number(byTime.get(key)?.portions ?? 0),
						orders: Number(byTime.get(key)?.orders ?? 0)
					})),
					generatedAt: new Date().toISOString()
				}
			},
			{ isolationLevel: 'RepeatableRead' }
		)
	}

	async rejections(query: StatisticsQueryDto) {
		const period = statisticsPeriod(query)
		return this.prisma.$transaction(
			async (tx) => {
				const range = await this.range(tx, query)
				const rows = await tx.orderRejection.findMany({
					where: { createDate: { gte: range.from, lt: range.until } },
					orderBy: [{ createDate: 'desc' }, { id: 'asc' }],
					select: { reason: true, createDate: true, lines: true }
				})
				const byReason = { STOP_LIST: 0, SHORTAGE: 0, BUSY: 0 },
					dishes = new Map<string, RefusedDish>()
				const series = new Map(
					period.keys.map((key) => [
						key,
						{ key, attempts: 0, portions: 0, stopList: 0, shortage: 0, busy: 0 }
					])
				)
				let portions = 0,
					incompleteAttempts = 0
				const formatter = new Intl.DateTimeFormat('en-CA', {
					timeZone: STATISTICS_TIME_ZONE,
					year: 'numeric',
					month: '2-digit',
					day: '2-digit',
					hour: '2-digit',
					hourCycle: 'h23'
				})
				for (const row of rows) {
					byReason[row.reason]++
					const parts = Object.fromEntries(
						formatter
							.formatToParts(row.createDate)
							.map((part) => [part.type, part.value])
					)
					const key =
						period.bucket === 'hour'
							? `${parts.hour}:00`
							: `${parts.year}-${parts.month}-${parts.day}`
					const point = series.get(key)!
					point.attempts++
					if (row.reason === 'STOP_LIST') point.stopList++
					else if (row.reason === 'SHORTAGE') point.shortage++
					else point.busy++
					if (row.reason === 'BUSY') continue
					const lines = this.lines(row.lines)
					const blocked = lines.filter((line) => line.blocked === true)
					if (
						!blocked.length ||
						lines.some((line) => line.blocked === undefined)
					)
						incompleteAttempts++
					const seen = new Set<string>()
					for (const line of blocked) {
						const dish = dishes.get(line.dishId) ?? {
							dishId: line.dishId,
							name: line.dishName,
							portions: 0,
							attempts: 0,
							stopList: 0,
							shortage: 0
						}
						dish.portions += line.count
						if (!seen.has(line.dishId)) {
							dish.attempts++
							seen.add(line.dishId)
						}
						if (row.reason === 'STOP_LIST') dish.stopList += line.count
						else dish.shortage += line.count
						dishes.set(line.dishId, dish)
						portions += line.count
						point.portions += line.count
					}
				}
				return {
					period,
					summary: {
						attempts: rows.length,
						portions,
						incompleteAttempts,
						byReason
					},
					dishes: [...dishes.values()].sort(
						(a, b) =>
							b.portions - a.portions ||
							a.name.localeCompare(b.name) ||
							a.dishId.localeCompare(b.dishId)
					),
					series: [...series.values()],
					generatedAt: new Date().toISOString()
				}
			},
			{ isolationLevel: 'RepeatableRead' }
		)
	}

	private async range(tx: Prisma.TransactionClient, query: StatisticsQueryDto) {
		const [range] = await tx.$queryRaw<Array<{ from: Date; until: Date }>>`
			SELECT (CAST(${query.from} AS date)::timestamp AT TIME ZONE ${STATISTICS_TIME_ZONE}) AT TIME ZONE 'UTC' AS "from",
			       ((CAST(${query.to} AS date) + interval '1 day')::timestamp AT TIME ZONE ${STATISTICS_TIME_ZONE}) AT TIME ZONE 'UTC' AS until
		`
		return range
	}

	private lines(value: Prisma.JsonValue): RejectionLine[] {
		if (!Array.isArray(value)) return []
		return value.flatMap((item) => {
			if (!item || typeof item !== 'object' || Array.isArray(item)) return []
			const { dishId, dishName, count, blocked } = item
			if (
				typeof dishId !== 'string' ||
				!dishId ||
				typeof count !== 'number' ||
				!Number.isSafeInteger(count) ||
				count <= 0
			)
				return []
			return [
				{
					dishId,
					dishName:
						typeof dishName === 'string' ? dishName : 'Неизвестное блюдо',
					count,
					...(typeof blocked === 'boolean' ? { blocked } : {})
				}
			]
		})
	}
}
