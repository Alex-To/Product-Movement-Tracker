import { Injectable } from '@nestjs/common'
import { RejectionReason } from '@prisma/client'
import { HOUR_MS } from '../../inventory/expiry'
import { PrismaService } from '../../prisma.service'

const PAGE_SIZE = 20
const SUMMARY_MS = 24 * HOUR_MS

type StoredShortage = { productName: string; unit: string; need: string; available: string }
type StoredDetails = { stopped?: string[]; shortages?: StoredShortage[] }

@Injectable()
export class ManagerRejectionsService {
	constructor(private readonly prisma: PrismaService) {}

	/**
	 * Журнал отказов: что заказывали, почему не приняли, чего не хватило.
	 * Сводка за сутки показывает, каких продуктов чаще всего не хватает
	 */
	async list(page: number) {
		const now = new Date()
		const since = new Date(now.getTime() - SUMMARY_MS)
		const [items, total, recent] = await this.prisma.$transaction(
			[
				this.prisma.orderRejection.findMany({
					orderBy: [{ createDate: 'desc' }, { id: 'asc' }],
					skip: (page - 1) * PAGE_SIZE,
					take: PAGE_SIZE,
					select: {
						id: true,
						createDate: true,
						reason: true,
						waiterName: true,
						lines: true,
						details: true
					}
				}),
				this.prisma.orderRejection.count(),
				this.prisma.orderRejection.findMany({
					where: { createDate: { gte: since } },
					select: { reason: true, details: true }
				})
			],
			{ isolationLevel: 'RepeatableRead' }
		)

		const byReason: Record<RejectionReason, number> = {
			STOP_LIST: 0,
			SHORTAGE: 0,
			BUSY: 0
		}
		const missing = new Map<string, { productName: string; unit: string; times: number }>()
		for (const rejection of recent) {
			byReason[rejection.reason]++
			for (const shortage of (rejection.details as StoredDetails).shortages ?? []) {
				const key = `${shortage.productName}|${shortage.unit}`
				const entry = missing.get(key) ?? {
					productName: shortage.productName,
					unit: shortage.unit,
					times: 0
				}
				entry.times++
				missing.set(key, entry)
			}
		}

		return {
			items: items.map((item) => ({
				...item,
				createDate: item.createDate.toISOString()
			})),
			total,
			page,
			pageSize: PAGE_SIZE,
			last24h: {
				total: recent.length,
				byReason,
				topMissing: [...missing.values()]
					.sort((a, b) => b.times - a.times || a.productName.localeCompare(b.productName))
					.slice(0, 5)
			},
			generatedAt: now.toISOString()
		}
	}
}
