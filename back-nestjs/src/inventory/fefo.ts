import { Prisma } from '@prisma/client'

type Decimal = Prisma.Decimal

export type FefoBatch = {
	id: string
	idProduct: string
	count: Decimal
	EXP: Date
	// Дата приёмки поставки: при равных сроках раньше уходит то, что раньше пришло
	receivedAt: Date
}

export type FefoTake = { batchId: string; productId: string; take: Decimal }

/**
 * Порядок FEFO: сначала ранний срок годности; при равных сроках — ранняя
 * приёмка (FIFO); при совпадении и её — id, чтобы порядок был однозначным
 */
export function fefoCompare(a: FefoBatch, b: FefoBatch) {
	return (
		a.EXP.getTime() - b.EXP.getTime() ||
		a.receivedAt.getTime() - b.receivedAt.getTime() ||
		(a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
	)
}

/**
 * Сколько взять из каждой партии, чтобы закрыть потребность по FEFO:
 * из каждой партии — меньшее из «остаток партии» и «сколько ещё нужно».
 * null — годных партий не хватает (весь заказ отклоняется, ничего не списывается)
 */
export function allocateFefo(
	batches: FefoBatch[],
	need: Map<string, Decimal>
): FefoTake[] | null {
	const sorted = [...batches].sort(fefoCompare)
	const takes: FefoTake[] = []
	for (const [productId, amount] of need) {
		let remaining = amount
		for (const batch of sorted) {
			if (remaining.lte(0)) break
			if (batch.idProduct !== productId || batch.count.lte(0)) continue
			const take = Prisma.Decimal.min(batch.count, remaining)
			takes.push({ batchId: batch.id, productId, take })
			remaining = remaining.minus(take)
		}
		if (remaining.gt(0)) return null
	}
	return takes
}
