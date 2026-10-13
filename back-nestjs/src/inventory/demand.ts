import { HOUR_MS } from './expiry'

// Одна «покупка» блюда: порции из принятого заказа или из отказа, где блюдо и было причиной
export type DemandEvent = { dishId: string; portions: number; at: Date }

export type Demand = {
	// Сколько часов реально покрывает история: от первого события в периоде до сейчас
	periodHours: number
	portions: Map<string, number>
}

/**
 * Спрос на блюда за период. null — истории нет совсем: тогда горячие считаются
 * так, будто продадут всё, что можно приготовить
 */
export function collectDemand(
	events: DemandEvent[],
	since: Date,
	now: Date
): Demand | null {
	const inPeriod = events.filter(
		(event) => event.at >= since && event.at <= now && event.portions > 0
	)
	if (!inPeriod.length) return null

	const first = Math.min(...inPeriod.map((event) => event.at.getTime()))
	const portions = new Map<string, number>()
	for (const event of inPeriod)
		portions.set(event.dishId, (portions.get(event.dishId) ?? 0) + event.portions)

	// Ресторан открылся три дня назад — темп считаем за три дня, а не за неделю
	return { periodHours: Math.max((now.getTime() - first) / HOUR_MS, 1), portions }
}

/**
 * Темп продаж блюда, порций в час. Каждому блюду засчитываем одну условную
 * порцию за период — новое или редкое блюдо не обнуляется.
 * Без истории — бесконечность: «продадут всё, что можно приготовить»
 */
export function salesRatePerHour(demand: Demand | null, dishId: string) {
	if (!demand) return Number.POSITIVE_INFINITY
	return ((demand.portions.get(dishId) ?? 0) + 1) / demand.periodHours
}
