import { Prisma } from '@prisma/client'
import { allocateFefo, type FefoBatch, fefoCompare } from './fefo'

const D = (value: string | number) => new Prisma.Decimal(value)
const day = (n: number) => new Date(Date.UTC(2026, 9, 10 + n))

const batch = (
	id: string,
	count: string,
	expiresDay: number,
	receivedDay = 0,
	idProduct = 'milk'
): FefoBatch => ({
	id,
	idProduct,
	count: D(count),
	EXP: day(expiresDay),
	receivedAt: day(receivedDay)
})

const plan = (batches: FefoBatch[], need: Record<string, string>) => {
	const takes = allocateFefo(
		batches,
		new Map(Object.entries(need).map(([product, amount]) => [product, D(amount)]))
	)
	return takes && takes.map(({ batchId, take }) => `${batchId}:${take.toString()}`)
}

describe('FEFO — порядок партий', () => {
	it('раньше всего — партия с ранним сроком', () => {
		expect([batch('b', '1', 5), batch('a', '1', 3)].sort(fefoCompare).map((b) => b.id)).toEqual(['a', 'b'])
	})

	it('при равном сроке — раньше принятая (FIFO), а не по id', () => {
		const late = batch('a-late', '1', 5, 2)
		const early = batch('z-early', '1', 5, 1)
		expect([late, early].sort(fefoCompare).map((b) => b.id)).toEqual(['z-early', 'a-late'])
	})

	it('при равных сроке и приёмке порядок однозначный — по id', () => {
		expect([batch('b', '1', 5), batch('a', '1', 5)].sort(fefoCompare).map((b) => b.id)).toEqual(['a', 'b'])
	})
})

describe('FEFO — распределение потребности', () => {
	it('сначала опустошает партию с ранним сроком, остаток берёт из следующей', () => {
		expect(plan([batch('late', '5', 9), batch('early', '2', 3)], { milk: '3' })).toEqual([
			'early:2',
			'late:1'
		])
	})

	it('хватает одной партии — следующую не трогает', () => {
		expect(plan([batch('early', '5', 3), batch('late', '5', 9)], { milk: '1.5' })).toEqual([
			'early:1.5'
		])
	})

	it('ровно весь остаток — берёт всё до нуля', () => {
		expect(plan([batch('a', '0.3', 3), batch('b', '0.2', 4)], { milk: '0.5' })).toEqual([
			'a:0.3',
			'b:0.2'
		])
	})

	it('продукты не смешиваются', () => {
		expect(
			plan([batch('m', '1', 3), batch('f', '1', 1, 0, 'flour')], { milk: '1', flour: '0.5' })
		).toEqual(['m:1', 'f:0.5'])
	})

	it('не хватает — null: весь заказ отклоняется, ничего не списывается', () => {
		expect(plan([batch('a', '1', 3)], { milk: '1.001' })).toBeNull()
	})

	it('пустые партии пропускает', () => {
		expect(plan([batch('empty', '0', 1), batch('full', '1', 2)], { milk: '1' })).toEqual(['full:1'])
	})
})
