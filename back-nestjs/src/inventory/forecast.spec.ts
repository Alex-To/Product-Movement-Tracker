import { Prisma } from '@prisma/client'
import { forecastProduct } from './forecast'
import { expiryPolicy, HOUR_MS } from './expiry'
import { FefoBatch } from './fefo'

const now = new Date('2026-10-14T09:00:00Z')
const policy = expiryPolicy({
	cookReserveMinutes: 30,
	urgentPercent: 25,
	urgentMinHours: 24,
	urgentMaxHours: 168
})
const decimal = (n: number | string) => new Prisma.Decimal(n)
const batch = (id: string, quantity: number, hours: number): FefoBatch => ({
	id,
	idProduct: 'product',
	count: decimal(quantity),
	EXP: new Date(+now + hours * HOUR_MS),
	receivedAt: new Date(+now - 24 * HOUR_MS)
})

describe('product forecast', () => {
	it('does not turn repeating hourly division into an extra purchase unit', () => {
		for (const unit of ['кг', 'шт']) {
			expect(
				forecastProduct([], decimal(7).div(24), now, 14, policy, unit).toOrder
			).toBe('98.000')
		}
		expect(
			forecastProduct([], decimal('7.000001').div(24), now, 14, policy, 'шт')
				.toOrder
		).toBe('99.000')
	})
	it('rounds piece procurement up while preserving fractional recipe demand', () => {
		const result = forecastProduct([], decimal('0.8'), now, 1, policy, 'шт')
		expect(result.demand).toBe('19.200')
		expect(result.toOrder).toBe('20.000')
		expect(
			forecastProduct([], decimal('0.8'), now, 1, policy, 'кг').toOrder
		).toBe('19.200')
		expect(
			forecastProduct([], decimal('0.8'), now, 1, policy, ' ШТ. ').toOrder
		).toBe('20.000')
	})
	it('does not order eggs when 400 cover two weeks of 200 per week', () => {
		const result = forecastProduct(
			[batch('eggs', 400, 24 * 20)],
			decimal(200).div(7 * 24),
			now,
			14,
			policy,
			'шт'
		)
		expect(result.toOrder).toBe('0.000')
	})
	it('uses FEFO and subtracts the cooking reserve before estimating losses', () => {
		const result = forecastProduct(
			[batch('later', 20, 240), batch('soon', 10, 2)],
			decimal(1),
			now,
			3,
			policy
		)
		expect(result.usable).toBe('30.000')
		expect(result.expectedUse).toBe('21.500')
		expect(result.expectedLoss).toBe('8.500')
		expect(result.toOrder).toBe('50.500')
		expect(result.batches.map((item) => item.id)).toEqual(['soon', 'later'])
	})
	it('does not count the same demand against every expiring batch', () => {
		const result = forecastProduct(
			[batch('a', 10, 2), batch('b', 10, 3)],
			decimal(1),
			now,
			1,
			policy
		)
		expect(result.expectedUse).toBe('2.500')
		expect(result.expectedLoss).toBe('17.500')
		expect(result.toOrder).toBe('21.500')
	})
	it('separates already expired and unusable quantities from future losses', () => {
		const result = forecastProduct(
			[
				batch('expired', 2, 0),
				batch('unusable', 3, 0.5),
				batch('good', 1, 100)
			],
			decimal(1),
			now,
			1,
			policy
		)
		expect(result.expired).toBe('2.000')
		expect(result.unusable).toBe('3.000')
		expect(result.usable).toBe('1.000')
		expect(result.expectedLoss).toBe('0.000')
		expect(result.toOrder).toBe('23.000')
	})
	it('does not invent procurement or expected losses without observations', () => {
		const result = forecastProduct([batch('a', 4, 2)], null, now, 1, policy)
		expect(result.atRisk).toBe('4.000')
		expect(result.expectedLoss).toBeNull()
		expect(result.toOrder).toBeNull()
		expect(result.dailyDemand).toBeNull()
	})
	it('never requests a negative quantity and leaves stock beyond the horizon', () => {
		const result = forecastProduct(
			[batch('a', 100, 240)],
			decimal(1),
			now,
			1,
			policy
		)
		expect(result.toOrder).toBe('0.000')
		expect(result.expectedUse).toBe('24.000')
		expect(result.expectedLoss).toBe('0.000')
	})
	it('rounds procurement upwards to the supported precision', () => {
		const result = forecastProduct([], decimal('0.00001'), now, 1, policy)
		expect(result.toOrder).toBe('0.001')
	})
	it('treats the exact end of the horizon as a loss boundary', () => {
		const result = forecastProduct(
			[batch('a', 30, 24.5)],
			decimal(1),
			now,
			1,
			policy
		)
		expect(result.expectedLoss).toBe('6.000')
	})
	it('keeps input stock intact', () => {
		const batches = [batch('b', 5, 3), batch('a', 5, 2)]
		forecastProduct(batches, decimal(1), now, 1, policy)
		expect(batches.map((item) => [item.id, item.count.toString()])).toEqual([
			['b', '5'],
			['a', '5']
		])
	})
})
