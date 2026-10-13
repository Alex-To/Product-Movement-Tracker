import { MessageType, Prisma, Role } from '@prisma/client'
import { PrismaService } from '../prisma.service'
import { inventoryTransaction, refreshAutoStops } from './availability'
import { type ExpiryPolicy, HOUR_MS, usableAfter } from './expiry'
import { loadExpiryPolicy } from './policy'

// Снятые записи стоп-листа хранятся неделю — потом удаляются, чтобы не копились
export const STOP_HISTORY_MS = 7 * 24 * HOUR_MS

/**
 * Ближайший момент, когда склад изменится сам, без заказов и поставок:
 * партия перестаёт годиться для готовки (срок − запас) или истекает (срок).
 * null — таких партий нет
 */
export function nextExpiryEvent(
	expirations: Date[],
	now: Date,
	policy: ExpiryPolicy
): Date | null {
	let next: number | null = null
	for (const expiresAt of expirations) {
		const unusableAt = expiresAt.getTime() - policy.cookReserveMs
		const at =
			unusableAt > now.getTime()
				? unusableAt
				: expiresAt.getTime() > now.getTime()
					? expiresAt.getTime()
					: null
		if (at !== null && (next === null || at < next)) next = at
	}
	return next === null ? null : new Date(next)
}

// С прошлой проверки что-то просрочилось или перестало годиться для готовки
async function hasDueEvents(
	db: PrismaService,
	since: Date,
	now: Date,
	policy: ExpiryPolicy
) {
	const due = await db.batch.count({
		where: {
			count: { gt: 0 },
			OR: [
				{ EXP: { lte: now } },
				{
					EXP: {
						gt: usableAfter(since, policy),
						lte: usableAfter(now, policy)
					}
				}
			]
		}
	})
	return due > 0
}

/**
 * Автосписание: каждая просроченная партия с остатком обнуляется движением
 * без автора и без заказа — так видно, что списала система. Менеджеры получают сообщение
 */
async function writeOffExpired(tx: Prisma.TransactionClient, now: Date) {
	const expired = await tx.batch.findMany({
		where: { count: { gt: 0 }, EXP: { lte: now } },
		select: { id: true, count: true }
	})
	if (!expired.length) return 0

	const managers = await tx.user.findMany({
		where: { role: Role.MANAGER },
		select: { id: true }
	})
	for (const batch of expired) {
		await tx.batch.update({ where: { id: batch.id }, data: { count: 0 } })
		const movement = await tx.stockMovement.create({
			data: {
				idBatch: batch.id,
				count: batch.count,
				createrId: null,
				createDate: now
			}
		})
		if (managers.length)
			await tx.message.createMany({
				data: managers.map((manager) => ({
					type: MessageType.WRITE_OFF,
					idRecipient: manager.id,
					idStockMovement: movement.id,
					createDate: now
				}))
			})
	}
	return expired.length
}

// Следующее событие считается по двум ближайшим срокам: среди ещё годных
// партий и среди тех, из которых уже нельзя готовить
async function findNextEvent(db: PrismaService, now: Date, policy: ExpiryPolicy) {
	const from = usableAfter(now, policy)
	const [usable, unusable] = await Promise.all([
		db.batch.findFirst({
			where: { count: { gt: 0 }, EXP: { gt: from } },
			orderBy: { EXP: 'asc' },
			select: { EXP: true }
		}),
		db.batch.findFirst({
			where: { count: { gt: 0 }, EXP: { gt: now, lte: from } },
			orderBy: { EXP: 'asc' },
			select: { EXP: true }
		})
	])
	return nextExpiryEvent(
		[usable?.EXP, unusable?.EXP].filter((date): date is Date => !!date),
		now,
		policy
	)
}

/**
 * Одна проверка сроков. since — время прошлой проверки; null — пересчитать всё
 * (старт сервера, смена настроек). Возвращает, сколько партий списано, и когда
 * проверять в следующий раз
 */
export async function runExpiryJobs(
	db: PrismaService,
	{ now, since }: { now: Date; since: Date | null }
) {
	const policy = await loadExpiryPolicy(db)
	let writtenOff = 0
	if (!since || (await hasDueEvents(db, since, now, policy))) {
		writtenOff = await inventoryTransaction(db, async (tx) => {
			const txPolicy = await loadExpiryPolicy(tx)
			const count = await writeOffExpired(tx, now)
			// Остаток мог уменьшиться просто от времени — пересчитываем все блюда
			await refreshAutoStops(tx, {}, now, txPolicy)
			return count
		})
	}
	return { writtenOff, next: await findNextEvent(db, now, policy) }
}

export async function purgeStopHistory(db: PrismaService, now: Date) {
	const { count } = await db.stopList.deleteMany({
		where: { closedAt: { lt: new Date(now.getTime() - STOP_HISTORY_MS) } }
	})
	return count
}
