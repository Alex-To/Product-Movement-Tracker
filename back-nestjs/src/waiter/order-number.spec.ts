import { nextOrderNumber } from './order-number'

describe('nextOrderNumber — номер заказа для кухни', () => {
	it('первый заказ — №1', () => {
		expect(nextOrderNumber(null)).toBe(1)
	})

	it('дальше — подряд', () => {
		expect(nextOrderNumber(1)).toBe(2)
		expect(nextOrderNumber(42)).toBe(43)
	})

	it('после 99 — снова 1', () => {
		expect(nextOrderNumber(98)).toBe(99)
		expect(nextOrderNumber(99)).toBe(1)
	})
})
