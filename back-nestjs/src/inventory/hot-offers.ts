import { Prisma } from '@prisma/client'
import { batchStatus, type ExpiryPolicy, HOUR_MS, urgentWindowMs } from './expiry'

type Decimal = Prisma.Decimal

export type HotBatch = {
	idProduct: string
	count: Decimal
	EXP: Date
	receivedAt: Date
}

export type HotDish = {
	id: string
	name: string
	// Сколько порций можно приготовить сейчас (N)
	portions: number
	ingredients: {
		idProduct: string
		count: Decimal
		productName: string
		unit: string
	}[]
}

// Вклад одного продукта — из него же собирается объяснение для менеджера
export type HotReason = {
	productName: string
	unit: string
	// Сколько продукта в срочных партиях
	atRisk: string
	// Сколько из этого успеют израсходовать на блюдо до конца сроков (по темпу продаж)
	saves: string
	// Срочность: какая доля окна срочности уже прошла (0…1), средняя по количеству
	urgency: number
	nearestExpiry: string
	contribution: number
}

export type HotScore = {
	score: number
	reasons: HotReason[]
	// Темп продаж блюда за период; null — истории нет, считаем «продадут все N»
	salesPerDay: number | null
}

/**
 * Срочность партии: какая доля её окна срочности уже прошла.
 * 0 — партия ещё не срочная (или из неё уже нельзя готовить), ближе к 1 — у самого конца
 */
export function batchUrgency(batch: HotBatch, now: Date, policy: ExpiryPolicy) {
	if (batchStatus(batch.EXP, batch.receivedAt, now, policy) !== 'urgent') return 0
	const leftMs = batch.EXP.getTime() - now.getTime()
	const windowMs = urgentWindowMs(batch.EXP, batch.receivedAt, policy)
	return Math.min(Math.max(1 - leftMs / windowMs, 0), 1)
}

const fefoOrder = (a: HotBatch, b: HotBatch) =>
	a.EXP.getTime() - b.EXP.getTime() ||
	a.receivedAt.getTime() - b.receivedAt.getTime()

/**
 * Приоритет блюда — сумма по продуктам рецепта:
 *   Σ по срочным партиям (срочность × сколько из партии успеют израсходовать) / под угрозой
 *   × min(1, под угрозой / норма на порцию).
 * «Успеют израсходовать» — моделируем списание по FEFO: к моменту, когда партия
 * перестанет годиться для готовки, блюдо продадут min(N, темп × часы) порций.
 * Популярное блюдо продаётся быстрее — спасает больше — приоритет выше.
 * Если под угрозой меньше одной порции, вклад уменьшается пропорционально:
 * 1 г в старой партии не делает блюдо горячим
 */
export function scoreDish(
	dish: HotDish,
	batchesByProduct: Map<string, HotBatch[]>,
	now: Date,
	policy: ExpiryPolicy,
	ratePerHour = Number.POSITIVE_INFINITY
): HotScore {
	const salesPerDay = Number.isFinite(ratePerHour) ? ratePerHour * 24 : null
	const reasons: HotReason[] = []
	if (dish.portions <= 0) return { score: 0, reasons, salesPerDay }

	for (const ingredient of dish.ingredients) {
		const perPortion = ingredient.count.toNumber()
		if (perPortion <= 0) continue
		const batches = [...(batchesByProduct.get(ingredient.idProduct) ?? [])]
			.filter((batch) => batch.count.gt(0))
			.sort(fefoOrder)

		let atRisk = 0
		let weighted = 0
		let saved = 0
		let savedWeighted = 0
		let consumedBefore = 0
		let nearestExpiry: number | null = null

		for (const batch of batches) {
			const quantity = batch.count.toNumber()
			const urgency = batchUrgency(batch, now, policy)
			// Сколько продукта уйдёт на блюдо, пока из этой партии ещё можно готовить
			const hours =
				(batch.EXP.getTime() - policy.cookReserveMs - now.getTime()) / HOUR_MS
			// Без истории темп бесконечен: Infinity × 0 дало бы NaN
			const portionsSold = hours > 0 ? Math.min(dish.portions, ratePerHour * hours) : 0
			const reaches = Math.min(
				Math.max(perPortion * portionsSold - consumedBefore, 0),
				quantity
			)
			if (urgency > 0) {
				atRisk += quantity
				weighted += quantity * urgency
				saved += reaches
				savedWeighted += reaches * urgency
				nearestExpiry = Math.min(nearestExpiry ?? Infinity, batch.EXP.getTime())
			}
			consumedBefore += quantity
		}
		if (!atRisk || !saved) continue

		const contribution = (savedWeighted / atRisk) * Math.min(1, atRisk / perPortion)
		reasons.push({
			productName: ingredient.productName,
			unit: ingredient.unit,
			atRisk: atRisk.toFixed(3),
			saves: saved.toFixed(3),
			urgency: weighted / atRisk,
			nearestExpiry: new Date(nearestExpiry!).toISOString(),
			contribution
		})
	}

	reasons.sort((a, b) => b.contribution - a.contribution)
	return {
		score: reasons.reduce((sum, reason) => sum + reason.contribution, 0),
		reasons,
		salesPerDay
	}
}

/**
 * Порядок доступных блюд: выше приоритет — выше в меню; при равном приоритете
 * — больше порций (больше можно продать); дальше по названию
 */
export function compareByPriority(
	a: { name: string; portions: number; score: number },
	b: { name: string; portions: number; score: number }
) {
	if (a.score !== b.score) return b.score - a.score
	if (a.score > 0 && a.portions !== b.portions) return b.portions - a.portions
	return a.name.localeCompare(b.name, 'ru')
}

// Горячие — первые hotLimit блюд с приоритетом больше нуля
export function pickHot<T extends { id: string; name: string; portions: number; score: number }>(
	dishes: T[],
	hotLimit: number
) {
	return new Set(
		dishes
			.filter((dish) => dish.score > 0 && dish.portions > 0)
			.sort(compareByPriority)
			.slice(0, hotLimit)
			.map((dish) => dish.id)
	)
}
