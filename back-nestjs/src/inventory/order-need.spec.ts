import { ConflictException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { BUSY_MESSAGE, inventoryTransaction } from './availability'
import {
	findShortages,
	mergeOrderLines,
	orderNeed,
	type RecipeDish
} from './order-need'

const D = (value: string | number) => new Prisma.Decimal(value)
const ingredient = (idProduct: string, count: string, name: string, unit = 'кг') => ({
	idProduct,
	count: D(count),
	product: { nameProduct: name, unit: { name: unit } }
})
const caesar: RecipeDish = {
	id: 'caesar',
	name: 'Цезарь',
	ingredients: [
		ingredient('chicken', '0.150', 'Курица'),
		ingredient('bread', '0.050', 'Багет'),
		ingredient('sauce', '0.030', 'Соус', 'л')
	]
}
const toast: RecipeDish = {
	id: 'toast',
	name: 'Тост',
	ingredients: [ingredient('bread', '0.100', 'Багет')]
}
const dishes = new Map([
	[caesar.id, caesar],
	[toast.id, toast]
])

describe('mergeOrderLines — строки чека', () => {
	it('одинаковые строки складываются, «без» — отдельная строка', () => {
		expect(
			mergeOrderLines([
				{ dishId: 'caesar', count: 1 },
				{ dishId: 'caesar', count: 2 },
				{ dishId: 'caesar', count: 1, excludedProductIds: ['bread'] }
			])
		).toEqual([
			{ dishId: 'caesar', count: 3, excluded: [] },
			{ dishId: 'caesar', count: 1, excluded: ['bread'] }
		])
	})

	it('порядок «без» не важен', () => {
		expect(
			mergeOrderLines([
				{ dishId: 'caesar', count: 1, excludedProductIds: ['sauce', 'bread'] },
				{ dishId: 'caesar', count: 1, excludedProductIds: ['bread', 'sauce'] }
			])
		).toEqual([{ dishId: 'caesar', count: 2, excluded: ['bread', 'sauce'] }])
	})
})

describe('orderNeed — потребность заказа', () => {
	it('порции × норма; общий продукт разных блюд суммируется', () => {
		const need = orderNeed(
			[
				{ dishId: 'caesar', count: 2, excluded: [] },
				{ dishId: 'toast', count: 3, excluded: [] }
			],
			dishes
		)
		expect(need.get('bread')?.amount.toString()).toBe('0.4')
		expect(need.get('chicken')?.amount.toString()).toBe('0.3')
	})

	it('убранный гостем продукт не нужен и не списывается', () => {
		const need = orderNeed([{ dishId: 'caesar', count: 2, excluded: ['bread'] }], dishes)
		expect(need.has('bread')).toBe(false)
		expect(need.get('chicken')?.dishes).toEqual([{ name: 'Цезарь (без: Багет)', count: 2 }])
	})
})

describe('findShortages — нехватка', () => {
	const need = orderNeed([{ dishId: 'toast', count: 3, excluded: [] }], dishes)

	it('годного остатка ровно хватает — нехватки нет', () => {
		expect(findShortages(need, new Map([['bread', D('0.3')]]))).toEqual([])
	})

	it('не хватает — нужно и сколько было', () => {
		expect(findShortages(need, new Map([['bread', D('0.299')]]))).toEqual([
			{
				productName: 'Багет',
				unit: 'кг',
				need: '0.3',
				available: '0.299',
				dishes: [{ name: 'Тост', count: 3 }]
			}
		])
	})

	it('продукта нет на складе вовсе — было 0', () => {
		expect(findShortages(need, new Map())[0].available).toBe('0')
	})
})

describe('inventoryTransaction — гонка с другими операциями', () => {
	const conflict = () =>
		new Prisma.PrismaClientKnownRequestError('serialization failure', {
			code: 'P2034',
			clientVersion: 'test'
		})

	it('конфликт повторяется, со второй попытки успех', async () => {
		const $transaction = jest
			.fn()
			.mockRejectedValueOnce(conflict())
			.mockResolvedValueOnce('order')
		await expect(inventoryTransaction({ $transaction } as never, jest.fn())).resolves.toBe('order')
		expect($transaction).toHaveBeenCalledTimes(2)
	})

	it('склад занят все три попытки — понятный отказ 409, а не ошибка 500', async () => {
		const $transaction = jest.fn().mockRejectedValue(conflict())
		const result = inventoryTransaction({ $transaction } as never, jest.fn())
		await expect(result).rejects.toBeInstanceOf(ConflictException)
		await expect(result).rejects.toThrow(BUSY_MESSAGE)
		expect($transaction).toHaveBeenCalledTimes(3)
	})

	it('другие ошибки не повторяются и не подменяются', async () => {
		const failure = new Error('boom')
		const $transaction = jest.fn().mockRejectedValue(failure)
		await expect(inventoryTransaction({ $transaction } as never, jest.fn())).rejects.toBe(failure)
		expect($transaction).toHaveBeenCalledTimes(1)
	})
})
