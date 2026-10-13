import { Prisma } from '@prisma/client'
import { expiryPolicy, HOUR_MS, MINUTE_MS } from './expiry'
import {
	batchUrgency,
	type HotBatch,
	type HotDish,
	pickHot,
	scoreDish
} from './hot-offers'

const D = (value: string | number) => new Prisma.Decimal(value)
const policy = expiryPolicy({
	cookReserveMinutes: 30,
	urgentPercent: 25,
	urgentMinHours: 24,
	urgentMaxHours: 168
})
const now = new Date('2026-10-13T12:00:00.000Z')
const DAY_MS = 24 * HOUR_MS

// Принята 4 дня назад: срок хранения 4 дня + остаток. Для остатка 12 ч окно = 25 % × 108 ч = 27 ч
const batch = (
	idProduct: string,
	count: string,
	leftMs: number,
	receivedAgoMs = 4 * DAY_MS
): HotBatch => ({
	idProduct,
	count: D(count),
	EXP: new Date(now.getTime() + leftMs),
	receivedAt: new Date(now.getTime() - receivedAgoMs)
})

const dish = (
	id: string,
	portions: number,
	ingredients: [string, string][]
): HotDish => ({
	id,
	name: id,
	portions,
	ingredients: ingredients.map(([idProduct, count]) => ({
		idProduct,
		count: D(count),
		productName: idProduct,
		unit: 'кг'
	}))
})

const byProduct = (batches: HotBatch[]) => {
	const map = new Map<string, HotBatch[]>()
	for (const item of batches) map.set(item.idProduct, [...(map.get(item.idProduct) ?? []), item])
	return map
}

const score = (target: HotDish, batches: HotBatch[], ratePerHour?: number) =>
	scoreDish(target, byProduct(batches), now, policy, ratePerHour).score

describe('batchUrgency — срочность партии', () => {
	it('свежая партия — 0', () => {
		expect(batchUrgency(batch('cream', '1', 5 * DAY_MS, 0), now, policy)).toBe(0)
	})

	it('срочная — доля прошедшего окна', () => {
		// окно 27 ч, осталось 12 ч → 1 − 12/27
		expect(batchUrgency(batch('cream', '1', 12 * HOUR_MS), now, policy)).toBeCloseTo(15 / 27)
	})

	it('из партии уже нельзя готовить — не горит, её не спасти продажей', () => {
		expect(batchUrgency(batch('cream', '1', 10 * MINUTE_MS), now, policy)).toBe(0)
	})

	it('чем ближе срок, тем выше срочность', () => {
		expect(batchUrgency(batch('cream', '1', 6 * HOUR_MS), now, policy)).toBeGreaterThan(
			batchUrgency(batch('cream', '1', 18 * HOUR_MS), now, policy)
		)
	})
})

describe('scoreDish — приоритет блюда', () => {
	const urgentCream = batch('cream', '2', 12 * HOUR_MS)

	it('нет срочных партий — 0', () => {
		expect(score(dish('soup', 10, [['cream', '0.1']]), [batch('cream', '5', 5 * DAY_MS, 0)])).toBe(0)
	})

	it('нет порций — 0, даже если продукт горит', () => {
		expect(score(dish('soup', 0, [['cream', '0.1']]), [urgentCream])).toBe(0)
	})

	it('под угрозой меньше порции — вклад пропорционально меньше', () => {
		const tail = batch('cream', '0.2', 12 * HOUR_MS)
		// 0,2 кг из порции 0,3 кг: вклад = срочность × 1 × (0,2 / 0,3)
		expect(score(dish('soup', 10, [['cream', '0.3']]), [tail])).toBeCloseTo(
			(batchUrgency(tail, now, policy) * 2) / 3
		)
	})

	it('1 г в старой партии почти ничего не весит', () => {
		expect(
			score(dish('soup', 10, [['cream', '0.3']]), [batch('cream', '0.001', 12 * HOUR_MS)])
		).toBeLessThan(0.01)
	})

	it('хвост партии рядом с другими партиями учитывается: по FEFO он уйдёт первым', () => {
		const tail = batch('cream', '0.2', 12 * HOUR_MS)
		const fresh = batch('cream', '5', 5 * DAY_MS, 0)
		expect(score(dish('soup', 10, [['cream', '0.3']]), [tail, fresh])).toBeGreaterThan(0)
	})

	it('блюдо, которое израсходует больше продукта под угрозой, — выше', () => {
		// 0,3 × 10 = 3 кг ≥ 2 кг под угрозой → израсходует всё; 0,05 × 10 = 0,5 кг → четверть
		const big = score(dish('carbonara', 10, [['cream', '0.3']]), [urgentCream])
		const small = score(dish('coffee', 10, [['cream', '0.05']]), [urgentCream])
		expect(big).toBeCloseTo(batchUrgency(urgentCream, now, policy))
		expect(small).toBeCloseTo(big / 4)
	})

	it('вклады ингредиентов складываются: два горящих продукта важнее одного', () => {
		const milk = batch('milk', '1', 12 * HOUR_MS)
		const one = score(dish('a', 10, [['cream', '0.3']]), [urgentCream, milk])
		const two = score(dish('b', 10, [['cream', '0.3'], ['milk', '0.1']]), [urgentCream, milk])
		expect(two).toBeGreaterThan(one)
	})

	it('объяснение — продукты по убыванию вклада, с количеством под угрозой', () => {
		const result = scoreDish(
			dish('b', 10, [['milk', '0.01'], ['cream', '0.3']]),
			byProduct([urgentCream, batch('milk', '1', 12 * HOUR_MS)]),
			now,
			policy
		)
		expect(result.reasons.map((reason) => reason.productName)).toEqual(['cream', 'milk'])
		expect(result.reasons[0]).toMatchObject({ atRisk: '2.000', saves: '2.000' })
		expect(result.reasons[1]).toMatchObject({ atRisk: '1.000', saves: '0.100' })
	})
})

describe('популярность — сколько успеют продать до срока', () => {
	// Срочные сливки 2 кг, из партии можно готовить ещё 11,5 ч (12 ч − запас 30 мин)
	const cream = batch('cream', '2', 12 * HOUR_MS)
	const recipe: [string, string][] = [['cream', '0.2']]

	it('без истории продаж — как будто продадут все N порций', () => {
		expect(score(dish('soup', 10, recipe), [cream])).toBeCloseTo(
			batchUrgency(cream, now, policy)
		)
	})

	it('популярное блюдо спасает больше — приоритет выше', () => {
		const popular = score(dish('soup', 10, recipe), [cream], 1) // 1 порция в час
		const rare = score(dish('soup', 10, recipe), [cream], 0.1) // 1 порция за 10 ч
		expect(popular).toBeGreaterThan(rare)
	})

	it('продадут меньше, чем есть под угрозой, — вклад по проданному', () => {
		// 0,4 порции в час × 11,5 ч = 4,6 порции × 0,2 кг = 0,92 кг из 2 кг
		expect(score(dish('soup', 10, recipe), [cream], 0.4)).toBeCloseTo(
			batchUrgency(cream, now, policy) * (0.92 / 2)
		)
	})

	it('больше N не продадут, даже если блюдо очень популярно', () => {
		// N = 3: 3 × 0,2 = 0,6 кг из 2 кг
		expect(score(dish('soup', 3, recipe), [cream], 100)).toBeCloseTo(
			batchUrgency(cream, now, policy) * 0.3
		)
	})

	it('сначала уходят партии с более ранним сроком: до срочной продажи могут не дойти', () => {
		// Раньше истекает ещё одна партия на 1 кг: продажи сначала уходят на неё, до сливок 2 кг почти не доходят
		const earlier = batch('cream', '1', 6 * HOUR_MS, HOUR_MS)
		const withEarlier = score(dish('soup', 10, recipe), [earlier, cream], 0.4)
		expect(withEarlier).toBeLessThan(score(dish('soup', 10, recipe), [cream], 0.4))
	})

	it('объяснение показывает темп продаж в день', () => {
		expect(
			scoreDish(dish('soup', 10, recipe), byProduct([cream]), now, policy, 0.5).salesPerDay
		).toBe(12)
	})
})

describe('pickHot — горячие блюда', () => {
	const rows = [
		{ id: 'b', name: 'Борщ', portions: 3, score: 0.5 },
		{ id: 'a', name: 'Алоэ', portions: 9, score: 0.5 },
		{ id: 'c', name: 'Цезарь', portions: 5, score: 0.9 },
		{ id: 'd', name: 'Драники', portions: 5, score: 0 },
		{ id: 'e', name: 'Ёжики', portions: 0, score: 0.95 }
	]

	it('не больше лимита; без приоритета и без порций — не горячие', () => {
		expect([...pickHot(rows, 10)]).toEqual(['c', 'a', 'b'])
	})

	it('при равном приоритете выше то, чего можно продать больше, а не по алфавиту', () => {
		expect([...pickHot(rows, 2)]).toEqual(['c', 'a'])
	})

	it('лимит 0 — горячих нет', () => {
		expect(pickHot(rows, 0).size).toBe(0)
	})
})
