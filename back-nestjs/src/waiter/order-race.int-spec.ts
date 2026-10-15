// Интеграционный тест на настоящей базе из .env: npm run test:int.
// Создаёт свои временные продукт, партии, блюдо и официанта с пометкой
// «тест гонки» и удаляет всё за собой. Обычный npm test его не запускает
import { Prisma, RejectionReason } from '@prisma/client'
import { MINUTE_MS } from '../inventory/expiry'
import { loadExpiryPolicy } from '../inventory/policy'
import { PrismaService } from '../prisma.service'
import { SettingsService } from '../settings/settings.service'
import { OrderRejectedException } from './order-rejection'
import { WaiterService } from './waiter.service'
import { HotOffersService } from '../inventory/hot-offers.service'

const TAG = `тест гонки ${Date.now()}`
const DAY_MS = 24 * 60 * MINUTE_MS

const prisma = new PrismaService()
const waiter = new WaiterService(prisma, new SettingsService(prisma), new HotOffersService())

let userId = ''
let unitId = ''

async function fixture(
	name: string,
	perPortion: string,
	batches: { count: string; expiresAt: Date; receivedAt: Date }[]
) {
	const product = await prisma.product.create({
		data: { nameProduct: `${name} [${TAG}]`, idUnit: unitId }
	})
	const created: string[] = []
	for (const [index, batch] of batches.entries()) {
		const delivery = await prisma.delivery.create({
			data: {
				number: `${TAG} ${name} ${index}`,
				createrId: userId,
				createDate: batch.receivedAt,
				batches: {
					create: {
						idProduct: product.id,
						count: batch.count,
						receivedCount: batch.count,
						EXP: batch.expiresAt
					}
				}
			},
			select: { id: true, batches: { select: { id: true } } }
		})
		created.push(delivery.batches[0].id)
	}
	const dish = await prisma.dish.create({
		data: {
			name: `${name} [${TAG}]`,
			ingredients: { create: { idProduct: product.id, count: perPortion } }
		}
	})
	return { productId: product.id, dishId: dish.id, batchIds: created }
}

const order = (dishId: string, count = 1) =>
	waiter.createOrder(userId, { items: [{ dishId, count }] })

const batchCount = async (id: string) =>
	(await prisma.batch.findUniqueOrThrow({ where: { id } })).count.toString()

beforeAll(async () => {
	await cleanup()
	const user = await prisma.user.create({
		data: {
			login: `race-${Date.now()}`,
			name: `Официант [${TAG}]`,
			password: 'not-a-real-hash',
			role: 'WAITER'
		}
	})
	userId = user.id
	const unit = await prisma.unit.findFirst()
	if (unit) unitId = unit.id
	else unitId = (await prisma.unit.create({ data: { name: `шт [${TAG}]` } })).id
})

// Удаляет всё с пометкой «тест гонки» — и этого запуска, и прошлых, если те упали
async function cleanup() {
	const marked = { contains: '[тест гонки' }
	const users = await prisma.user.findMany({ where: { name: marked }, select: { id: true } })
	const userIds = users.map((user) => user.id)
	const products = await prisma.product.findMany({
		where: { nameProduct: marked },
		select: { id: true }
	})
	const productIds = products.map((product) => product.id)
	const batchIds = (
		await prisma.batch.findMany({
			where: { idProduct: { in: productIds } },
			select: { id: true }
		})
	).map((batch) => batch.id)
	await prisma.message.deleteMany({ where: { stockMovement: { idBatch: { in: batchIds } } } })
	await prisma.stockMovement.deleteMany({ where: { idBatch: { in: batchIds } } })
	await prisma.orderRejection.deleteMany({ where: { waiterId: { in: userIds } } })
	await prisma.order.deleteMany({ where: { createrId: { in: userIds } } })
	const dishes = await prisma.dish.findMany({ where: { name: marked }, select: { id: true } })
	await prisma.stopList.deleteMany({ where: { idDish: { in: dishes.map((dish) => dish.id) } } })
	await prisma.dish.deleteMany({ where: { id: { in: dishes.map((dish) => dish.id) } } })
	await prisma.batch.deleteMany({ where: { id: { in: batchIds } } })
	await prisma.delivery.deleteMany({ where: { createrId: { in: userIds } } })
	await prisma.product.deleteMany({ where: { id: { in: productIds } } })
	await prisma.unit.deleteMany({ where: { name: marked } })
	await prisma.user.deleteMany({ where: { id: { in: userIds } } })
}

afterAll(async () => {
	try {
		await cleanup()
	} finally {
		await prisma.$disconnect()
	}
})

describe('заказ на живой базе', () => {
	it('два заказа одновременно за последнюю порцию: один принят, второй отклонён, остаток не уходит в минус', async () => {
		const now = Date.now()
		const { dishId, batchIds } = await fixture('Последняя порция', '0.300', [
			{ count: '0.300', expiresAt: new Date(now + 2 * DAY_MS), receivedAt: new Date(now - DAY_MS) }
		])

		const results = await Promise.allSettled([order(dishId), order(dishId)])
		const accepted = results.filter((result) => result.status === 'fulfilled')
		const rejected = results.filter(
			(result): result is PromiseRejectedResult => result.status === 'rejected'
		)

		expect(accepted).toHaveLength(1)
		expect(rejected).toHaveLength(1)
		expect(rejected[0].reason).toBeInstanceOf(OrderRejectedException)
		expect(await batchCount(batchIds[0])).toBe('0')

		const written = await prisma.stockMovement.aggregate({
			where: { idBatch: batchIds[0] },
			_sum: { count: true }
		})
		expect(written._sum.count?.toString()).toBe('0.3')

		// Отказ попал в журнал менеджера
		const journal = await prisma.orderRejection.findMany({ where: { waiterId: userId } })
		expect(journal.map((row) => row.reason)).toEqual(
			expect.arrayContaining([
				expect.stringMatching(new RegExp(`${RejectionReason.SHORTAGE}|${RejectionReason.BUSY}`))
			])
		)
	})

	it('FEFO: списывается партия с ранним сроком, при равном сроке — раньше принятая', async () => {
		const now = Date.now()
		const expiresAt = new Date(now + 3 * DAY_MS)
		const { dishId, batchIds } = await fixture('FEFO', '1', [
			{ count: '5', expiresAt: new Date(now + 5 * DAY_MS), receivedAt: new Date(now - 3 * DAY_MS) },
			{ count: '2', expiresAt, receivedAt: new Date(now - DAY_MS) },
			{ count: '2', expiresAt, receivedAt: new Date(now - 2 * DAY_MS) }
		])
		const [late, sameLater, sameEarlier] = batchIds

		await order(dishId, 3)

		expect(await batchCount(sameEarlier)).toBe('0') // тот же срок, принята раньше — первой
		expect(await batchCount(sameLater)).toBe('1')
		expect(await batchCount(late)).toBe('5')
	})

	it('партия, из которой уже не успеть приготовить, не списывается — заказ отклонён', async () => {
		const now = Date.now()
		const policy = await loadExpiryPolicy(prisma)
		// Истечёт до конца запаса на готовку
		const expiresAt = new Date(now + Math.max(policy.cookReserveMs / 2, MINUTE_MS))
		const { dishId, batchIds } = await fixture('Почти истекла', '1', [
			{ count: '10', expiresAt, receivedAt: new Date(now - DAY_MS) }
		])

		await expect(order(dishId)).rejects.toMatchObject({
			reason: RejectionReason.SHORTAGE
		})
		expect(await batchCount(batchIds[0])).toBe('10')
	})

	it('номера заказов: одновременные заказы получают разные номера подряд, отказ номера не получает', async () => {
		const now = Date.now()
		const { dishId } = await fixture('Номера', '1', [
			{ count: '10', expiresAt: new Date(now + 2 * DAY_MS), receivedAt: new Date(now - DAY_MS) }
		])
		const last = await prisma.order.findFirst({
			orderBy: [{ createDate: 'desc' }, { id: 'desc' }],
			select: { number: true }
		})

		const results = await Promise.allSettled([order(dishId), order(dishId), order(dishId)])
		const numbers = results
			.filter((result) => result.status === 'fulfilled')
			.map((result) => (result as PromiseFulfilledResult<{ number: number }>).value.number)
			.sort((a, b) => a - b)
		// Склад мог быть «занят» для одного из трёх — тогда он отклонён и номера не получил
		expect(new Set(numbers).size).toBe(numbers.length)
		const start = last ? (last.number % 99) + 1 : 1
		expect(numbers).toEqual(
			numbers.map((_, index) => ((start - 1 + index) % 99) + 1).sort((a, b) => a - b)
		)
		await expect(order(dishId, 20)).rejects.toBeInstanceOf(OrderRejectedException)
		const after = await prisma.order.count({ where: { createrId: userId, number: { in: numbers } } })
		expect(after).toBe(numbers.length)
	})

	it('отказ ничего не списывает: весь заказ или ничего', async () => {
		const now = Date.now()
		const enough = await fixture('Хватает', '1', [
			{ count: '10', expiresAt: new Date(now + 2 * DAY_MS), receivedAt: new Date(now - DAY_MS) }
		])
		const short = await fixture('Не хватает', '1', [
			{ count: '0.5', expiresAt: new Date(now + 2 * DAY_MS), receivedAt: new Date(now - DAY_MS) }
		])

		await expect(
			waiter.createOrder(userId, {
				items: [
					{ dishId: enough.dishId, count: 2 },
					{ dishId: short.dishId, count: 1 }
				]
			})
		).rejects.toBeInstanceOf(OrderRejectedException)
		expect(await batchCount(enough.batchIds[0])).toBe('10')
		expect(await batchCount(short.batchIds[0])).toBe(new Prisma.Decimal('0.5').toString())
	})
})
