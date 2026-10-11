// Run from back-nestjs: node src/manager/tests/warehouse.integration.cjs
// Creates and drops only a unique manager_test_* schema on local PostgreSQL.
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { spawnSync } = require('node:child_process')
const path = require('node:path')
require('dotenv').config()

const url = new URL(process.env.DATABASE_URL)
assert(
	['localhost', '127.0.0.1', '[::1]'].includes(url.hostname),
	'Integration tests require a local database'
)
const schema = 'manager_test_' + randomUUID().replaceAll('-', '')
url.searchParams.set('schema', schema)
process.env.DATABASE_URL = url.toString()

require('ts-node/register/transpile-only')
require('tsconfig-paths/register')
require('reflect-metadata')
const { PrismaClient } = require('@prisma/client')
const { NestFactory } = require('@nestjs/core')
const { JwtService } = require('@nestjs/jwt')
const { PrismaService } = require('../../prisma.service')
const { AppModule } = require('../../app.module')
const request = require('supertest')
const prisma = new PrismaClient()
let app
let checks = 0

async function run() {
	const setup = spawnSync(
		process.execPath,
		[require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
		{ env: process.env, encoding: 'utf8' }
	)
	assert.equal(setup.status, 0, setup.stderr)
	app = await NestFactory.create(AppModule, { logger: ['error'] })
	app.setGlobalPrefix('api')
	await app.init()
	const jwt = app.get(JwtService),
		users = {},
		tokens = {}
	for (const role of ['MANAGER', 'ADMIN', 'KITCHEN', 'WAITER']) {
		users[role] = await prisma.user.create({
			data: { login: role, name: role, password: 'unused', role }
		})
		tokens[role] = jwt.sign({ id: users[role].id, role }, { expiresIn: '10m' })
	}
	const call = async (route, expected = 200, role = 'MANAGER') => {
		let req = request(app.getHttpServer()).get('/api/manager/warehouse' + route)
		if (role) req = req.set('Authorization', 'Bearer ' + tokens[role])
		const response = await req
		assert.equal(
			response.status,
			expected,
			route + ': ' + JSON.stringify(response.body)
		)
		checks++
		return response.body
	}
	for (const role of [null, 'ADMIN', 'KITCHEN', 'WAITER'])
		for (const route of ['/products', '/signals', '/products/missing/batches'])
			await call(route, role ? 403 : 401, role)
	assert.deepEqual((await call('/products')).items, [])
	const empty = await call('/signals')
	assert.equal(empty.expiring.total, 0)
	assert.equal(empty.expired.total, 0)
	assert.equal(empty.stopped.total, 0)
	const unit = await prisma.unit.create({ data: { name: 'кг' } }),
		product = await prisma.product.create({
			data: { nameProduct: 'Сливки 33%', idUnit: unit.id }
		}),
		noStock = await prisma.product.create({
			data: { nameProduct: 'Нет партий', idUnit: unit.id }
		}),
		expiredProduct = await prisma.product.create({
			data: { nameProduct: 'Только просрочка', idUnit: unit.id }
		})
	const supplier = await prisma.supplier.create({
			data: { name: 'Ферма', nameKey: 'ферма' }
		}),
		delivery = await prisma.delivery.create({
			data: {
				number: 'П-001',
				supplierId: supplier.id,
				createrId: users.MANAGER.id
			}
		})
	const now = Date.now(),
		soon = new Date(now + 3600000),
		later = new Date(now + 86400000 * 3),
		past = new Date(now - 3600000)
	const add = async (id, productId, count, EXP) =>
		prisma.batch.create({
			data: {
				id,
				idProduct: productId,
				idDelivery: delivery.id,
				count,
				receivedCount: '10.000',
				EXP
			}
		})
	await add('good-b', product.id, '0.200', soon)
	await add('good-a', product.id, '0.100', soon)
	await add('good-later', product.id, '2.000', later)
	await add('expired', product.id, '9.000', past)
	await add('closed', product.id, '0.000', new Date(now + 10000))
	await add('only-expired', expiredProduct.id, '7.000', past)
	const full = await call('/products')
	const row = full.items.find((item) => item.id === product.id)
	assert.equal(row.availableQuantity, '2.300')
	assert.equal(row.expiredQuantity, '9.000')
	assert.equal(row.batchesCount, 4)
	assert(row.expiring)
	assert(row.hasExpired)
	assert.equal(row.nearestExpiry, soon.toISOString())
	assert(!row.nearestExpired)
	assert.equal(
		full.items.find((item) => item.id === noStock.id).batchesCount,
		0
	)
	assert.equal(
		full.items.find((item) => item.id === noStock.id).nearestExpiry,
		null
	)
	const expiredRow = full.items.find((item) => item.id === expiredProduct.id)
	assert.equal(expiredRow.availableQuantity, '0.000')
	assert(expiredRow.nearestExpired)
	assert.equal(expiredRow.expiredQuantity, '7.000')
	const filtered = await call('/products?expiringOnly=true')
	assert.equal(filtered.total, 1)
	assert.equal(filtered.items[0].id, product.id)
	assert.equal(
		(await call('/products?' + new URLSearchParams({ search: '33 сливки' })))
			.total,
		1
	)
	for (const query of ['page=0', 'page=1.5', 'expiringOnly=yes', 'extra=true'])
		await call('/products?' + query, 400)
	await call('/products/missing/batches', 404)
	await call('/products/' + product.id + '/batches?page=0', 400)
	const batches = await call('/products/' + product.id + '/batches')
	assert.deepEqual(
		batches.items.map((item) => item.id),
		['good-a', 'good-b', 'good-later', 'expired']
	)
	assert.deepEqual(
		batches.items.map((item) => item.fefoRank),
		[1, 2, 3, null]
	)
	assert.equal(batches.goodCount, 3)
	assert.equal(batches.expiredCount, 1)
	assert.equal(batches.items[0].delivery.supplier.name, 'Ферма')
	assert.equal(batches.items[0].receivedQuantity, '10.000')
	assert(batches.items[3].remainingSeconds < 0)
	assert.equal((await call('/products/' + noStock.id + '/batches')).total, 0)
	const enough = await prisma.dish.create({
			data: {
				name: 'Достаточно',
				ingredients: { create: { idProduct: product.id, count: '0.100' } }
			}
		}),
		blocked = await prisma.dish.create({
			data: {
				name: 'Недостаточно',
				ingredients: { create: { idProduct: product.id, count: '5.000' } },
				stopLists: { create: { type: 'MANUAL', createrId: users.KITCHEN.id } }
			}
		}),
		manual = await prisma.dish.create({
			data: {
				name: 'Ручной',
				ingredients: { create: { idProduct: product.id, count: '0.100' } },
				stopLists: { create: { type: 'MANUAL', createrId: users.KITCHEN.id } }
			}
		})
	await prisma.dish.create({
		data: {
			name: 'Корзина',
			deletedAt: new Date(),
			ingredients: { create: { idProduct: product.id, count: '9.000' } },
			stopLists: { create: { type: 'MANUAL', createrId: users.KITCHEN.id } }
		}
	})
	await prisma.stopList.create({ data: { idDish: enough.id, type: 'AUTO' } })
	const snapshot = async () =>
		JSON.stringify({
			batches: await prisma.batch.findMany({ orderBy: { id: 'asc' } }),
			dishes: await prisma.dish.findMany({ orderBy: { id: 'asc' } }),
			stops: await prisma.stopList.findMany({ orderBy: { id: 'asc' } }),
			movementCount: await prisma.stockMovement.count()
		})
	const before = await snapshot()
	const signals = await call('/signals')
	assert.equal(signals.expiring.total, 2)
	assert.equal(signals.expired.total, 2)
	assert.equal(signals.stopped.total, 2)
	assert(!signals.stopped.items.some((item) => item.id === enough.id))
	assert(signals.stopped.items.find((item) => item.id === blocked.id).autoStop)
	assert(
		signals.stopped.items.find((item) => item.id === blocked.id).manualStop
	)
	assert.deepEqual(
		signals.stopped.items.find((item) => item.id === blocked.id).missing,
		['Сливки 33%']
	)
	assert(!signals.stopped.items.find((item) => item.id === manual.id).autoStop)
	await call('/products')
	await call('/products/' + product.id + '/batches')
	assert.equal(
		await snapshot(),
		before,
		'All warehouse reads must leave DB unchanged'
	)
	await prisma.batch.updateMany({
		where: { id: { in: ['good-a', 'good-b', 'good-later'] } },
		data: { EXP: past }
	})
	const expiredSignals = await call('/signals')
	assert.equal(expiredSignals.expiring.total, 0)
	assert.equal(expiredSignals.stopped.total, 3)
	assert(
		expiredSignals.stopped.items.find((item) => item.id === enough.id).autoStop
	)
	const many = await prisma.product.create({
		data: { nameProduct: 'Много партий', idUnit: unit.id }
	})
	for (let i = 1; i <= 26; i++)
		await add('page-' + String(i).padStart(2, '0'), many.id, '1.000', later)
	await add('page-expired-1', many.id, '1.000', past)
	await add('page-expired-2', many.id, '1.000', past)
	const secondPage = await call('/products/' + many.id + '/batches?page=2')
	assert.equal(secondPage.total, 28)
	assert.equal(secondPage.items.length, 3)
	assert.equal(secondPage.items[0].fefoRank, 26)
	assert.deepEqual(
		secondPage.items.slice(1).map((item) => item.fefoRank),
		[null, null]
	)
	await prisma.product.createMany({
		data: Array.from({ length: 26 }, (_, i) => ({
			nameProduct: 'Пагинация ' + i,
			idUnit: unit.id
		}))
	})
	const paged = await call(
		'/products?' + new URLSearchParams({ search: 'Пагинация', page: '2' })
	)
	assert.equal(paged.total, 26)
	assert.equal(paged.items.length, 1)
	console.log(
		`PASS: ${checks} warehouse API checks; roles, validation, positive/expired/closed stock, exact Decimal sums, FEFO ties/pagination, live AUTO vs MANUAL, archived recipes and read-only DB snapshots.`
	)
}
run()
	.catch((error) => {
		console.error(error.message)
		process.exitCode = 1
	})
	.finally(async () => {
		if (app) {
			const clients = app.get(PrismaService, { each: true })
			await app.close()
			await Promise.all(clients.map((client) => client.$disconnect()))
		}
		try {
			assert(/^manager_test_[a-f0-9]{32}$/.test(schema))
			await prisma.$executeRawUnsafe(
				`DROP SCHEMA IF EXISTS "${schema}" CASCADE`
			)
			console.log('Isolated test schema removed.')
		} finally {
			await prisma.$disconnect()
		}
	})
