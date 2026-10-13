import { collectDemand, salesRatePerHour } from './demand'
import { HOUR_MS } from './expiry'

const now = new Date('2026-10-13T12:00:00.000Z')
const ago = (hours: number) => new Date(now.getTime() - hours * HOUR_MS)
const week = ago(7 * 24)

describe('collectDemand — спрос за период', () => {
	it('нет ни заказов, ни отказов — истории нет', () => {
		expect(collectDemand([], week, now)).toBeNull()
	})

	it('складывает порции блюда из заказов и отказов', () => {
		const demand = collectDemand(
			[
				{ dishId: 'soup', portions: 2, at: ago(10) },
				{ dishId: 'soup', portions: 1, at: ago(5) },
				{ dishId: 'cake', portions: 4, at: ago(1) }
			],
			week,
			now
		)
		expect(demand?.portions.get('soup')).toBe(3)
		expect(demand?.portions.get('cake')).toBe(4)
	})

	it('события старше периода не считаются', () => {
		expect(collectDemand([{ dishId: 'soup', portions: 5, at: ago(8 * 24) }], week, now)).toBeNull()
	})

	it('период — от первого события, а не вся неделя: ресторан мог открыться вчера', () => {
		expect(collectDemand([{ dishId: 'soup', portions: 1, at: ago(24) }], week, now)?.periodHours).toBe(24)
	})
})

describe('salesRatePerHour — темп продаж', () => {
	const demand = collectDemand([{ dishId: 'soup', portions: 9, at: ago(10) }], week, now)

	it('порции за период + одна условная, делённые на часы', () => {
		expect(salesRatePerHour(demand, 'soup')).toBeCloseTo(10 / 10)
	})

	it('блюдо без заказов не обнуляется', () => {
		expect(salesRatePerHour(demand, 'cake')).toBeCloseTo(1 / 10)
	})

	it('без истории — бесконечный темп: «продадут все N»', () => {
		expect(salesRatePerHour(null, 'soup')).toBe(Number.POSITIVE_INFINITY)
	})
})
