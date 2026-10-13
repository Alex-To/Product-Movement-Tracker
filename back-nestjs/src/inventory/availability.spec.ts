import { Prisma, StopType } from '@prisma/client'
import { availableStock, countPortions, refreshAutoStops } from './availability'
import { expiryPolicy, MINUTE_MS } from './expiry'

const D = (value: string | number) => new Prisma.Decimal(value)
const policy = expiryPolicy({
	cookReserveMinutes: 30,
	urgentPercent: 25,
	urgentMinHours: 24,
	urgentMaxHours: 168
})
const now = new Date('2026-10-13T12:00:00.000Z')

describe('countPortions — можно приготовить N порций', () => {
	const stock = new Map([
		['flour', D('1.000')],
		['milk', D('0.500')]
	])

	it('минимум по ингредиентам, вниз до целого', () => {
		expect(
			countPortions(
				[
					{ idProduct: 'flour', count: D('0.300') },
					{ idProduct: 'milk', count: D('0.200') }
				],
				stock
			)
		).toBe(2)
	})

	it('продукта нет на складе — 0', () => {
		expect(countPortions([{ idProduct: 'eggs', count: D(1) }], stock)).toBe(0)
	})

	it('без рецепта — 0', () => {
		expect(countPortions([], stock)).toBe(0)
	})

	it('ровно на одну порцию — 1', () => {
		expect(countPortions([{ idProduct: 'milk', count: D('0.500') }], stock)).toBe(1)
	})
})

describe('availableStock — годный остаток', () => {
	it('берёт только партии, срок которых позже «сейчас + запас на готовку»', async () => {
		const groupBy = jest.fn().mockResolvedValue([])
		await availableStock({ batch: { groupBy } } as never, now, ['milk'], policy)
		expect(groupBy).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					idProduct: { in: ['milk'] },
					EXP: { gt: new Date(now.getTime() + 30 * MINUTE_MS) },
					count: { gt: 0 }
				}
			})
		)
	})
})

describe('refreshAutoStops — авто-стоп с историей', () => {
	function fakeTx(stock: Record<string, string>, openAuto: string[]) {
		const tx = {
			dish: {
				findMany: jest.fn().mockResolvedValue([
					{ id: 'soup', ingredients: [{ idProduct: 'milk', count: D('0.300') }] },
					{ id: 'cake', ingredients: [{ idProduct: 'flour', count: D('0.200') }] }
				])
			},
			batch: {
				groupBy: jest.fn().mockResolvedValue(
					Object.entries(stock).map(([idProduct, count]) => ({
						idProduct,
						_sum: { count: D(count) }
					}))
				)
			},
			stopList: {
				findMany: jest
					.fn()
					.mockResolvedValue(openAuto.map((idDish) => ({ idDish }))),
				createMany: jest.fn(),
				updateMany: jest.fn()
			}
		}
		return tx
	}

	it('порций не осталось — открывает запись, время = «сейчас»', async () => {
		const tx = fakeTx({ flour: '1' }, [])
		await expect(
			refreshAutoStops(tx as never, {}, now, policy)
		).resolves.toEqual({ opened: 1, closed: 0 })
		expect(tx.stopList.createMany).toHaveBeenCalledWith({
			data: [{ idDish: 'soup', type: StopType.AUTO, createdAt: now }]
		})
		expect(tx.stopList.updateMany).not.toHaveBeenCalled()
	})

	it('порции появились — закрывает запись, а не удаляет', async () => {
		const tx = fakeTx({ milk: '1', flour: '1' }, ['soup'])
		await expect(
			refreshAutoStops(tx as never, {}, now, policy)
		).resolves.toEqual({ opened: 0, closed: 1 })
		expect(tx.stopList.updateMany).toHaveBeenCalledWith({
			where: {
				idDish: { in: ['soup'] },
				type: StopType.AUTO,
				closedAt: null
			},
			data: { closedAt: now }
		})
	})

	it('стоп уже открыт и порций по-прежнему нет — вторую запись не создаёт', async () => {
		const tx = fakeTx({ flour: '1' }, ['soup'])
		await expect(
			refreshAutoStops(tx as never, {}, now, policy)
		).resolves.toEqual({ opened: 0, closed: 0 })
		expect(tx.stopList.createMany).not.toHaveBeenCalled()
	})
})
