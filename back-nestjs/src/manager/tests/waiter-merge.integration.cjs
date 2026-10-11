// Run from back-nestjs: node src/manager/tests/waiter-merge.integration.cjs
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
	const r = spawnSync(
		process.execPath,
		[require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
		{ env: process.env, encoding: 'utf8' }
	)
	assert.equal(r.status, 0, r.stderr)
	app = await NestFactory.create(AppModule, { logger: ['error'] })
	app.setGlobalPrefix('api')
	await app.init()
	const manager = await prisma.user.create({
			data: {
				login: 'manager',
				name: 'Manager',
				password: 'unused',
				role: 'MANAGER'
			}
		}),
		waiter = await prisma.user.create({
			data: {
				login: 'waiter',
				name: 'Waiter',
				password: 'unused',
				role: 'WAITER'
			}
		})
	const token = app
		.get(JwtService)
		.sign({ id: waiter.id, role: 'WAITER' }, { expiresIn: '10m' })
	const call = async (method, route, body, expected = 200) => {
		let req = request(app.getHttpServer())
			[method]('/api/waiter' + route)
			.set('Authorization', 'Bearer ' + token)
		if (body !== undefined) req = req.send(body)
		const res = await req
		assert.equal(
			res.status,
			expected,
			`${method} ${route}: ${JSON.stringify(res.body)}`
		)
		checks++
		return res.body
	}
	const unit = await prisma.unit.create({ data: { name: 'кг' } }),
		product = await prisma.product.create({
			data: { nameProduct: 'Товар', idUnit: unit.id }
		}),
		delivery = await prisma.delivery.create({
			data: { number: 'Fixture', createrId: manager.id }
		})
	const early = await prisma.batch.create({
			data: {
				idProduct: product.id,
				idDelivery: delivery.id,
				count: '0.200',
				EXP: new Date(Date.now() + 3600000)
			}
		}),
		late = await prisma.batch.create({
			data: {
				idProduct: product.id,
				idDelivery: delivery.id,
				count: '0.300',
				EXP: new Date(Date.now() + 86400000)
			}
		}),
		expired = await prisma.batch.create({
			data: {
				idProduct: product.id,
				idDelivery: delivery.id,
				count: '99',
				EXP: new Date(Date.now() - 1000)
			}
		})
	const dish = await prisma.dish.create({
			data: {
				name: 'Блюдо',
				ingredients: { create: { idProduct: product.id, count: '0.125' } }
			}
		}),
		trash = await prisma.dish.create({
			data: {
				name: 'В корзине',
				deletedAt: new Date(),
				ingredients: { create: { idProduct: product.id, count: '0.100' } }
			}
		})
	await prisma.stopList.create({ data: { idDish: dish.id, type: 'AUTO' } })
	const menu = await call('get', '/menu')
	assert(!menu.some((item) => item.id === trash.id))
	assert.equal(menu.find((item) => item.id === dish.id).portions, 4)
	assert.equal(
		menu.find((item) => item.id === dish.id).isStopped,
		false,
		'Stale persisted AUTO does not override actual stock'
	)
	await call(
		'post',
		'/orders',
		{ items: [{ dishId: trash.id, count: 1 }] },
		404
	)
	assert.equal(await prisma.order.count(), 0)
	await prisma.stopList.create({
		data: { idDish: dish.id, type: 'MANUAL', createrId: manager.id }
	})
	await call('post', '/orders', { items: [{ dishId: dish.id, count: 1 }] }, 409)
	assert.equal(await prisma.order.count(), 0)
	await prisma.stopList.deleteMany({
		where: { idDish: dish.id, type: 'MANUAL' }
	})
	const order = await call(
		'post',
		'/orders',
		{ items: [{ dishId: dish.id, count: 2 }] },
		201
	)
	assert.equal(
		(await prisma.batch.findUnique({ where: { id: early.id } })).count.toFixed(
			3
		),
		'0.000'
	)
	assert.equal(
		(await prisma.batch.findUnique({ where: { id: late.id } })).count.toFixed(
			3
		),
		'0.250'
	)
	assert.equal(
		(
			await prisma.batch.findUnique({ where: { id: expired.id } })
		).count.toFixed(3),
		'99.000'
	)
	assert.equal(
		await prisma.stockMovement.count({ where: { idOrder: order.id } }),
		2
	)
	const { ManagerDishesService } = require('../dishes/dishes.service')
	const recipe = app.get(ManagerDishesService)
	await recipe.trash(dish.id, 1)
	await call('post', '/orders', { items: [{ dishId: dish.id, count: 1 }] }, 404)
	assert.equal(await prisma.order.count(), 1)
	await recipe.restore(dish.id, 2)
	const req = () =>
		request(app.getHttpServer())
			.post('/api/waiter/orders')
			.set('Authorization', 'Bearer ' + token)
			.send({ items: [{ dishId: dish.id, count: 2 }] })
	const races = await Promise.all([req(), req()])
	assert.deepEqual(races.map((res) => res.status).sort(), [201, 409])
	assert.equal(await prisma.order.count(), 2)
	assert.equal(
		(await prisma.batch.findUnique({ where: { id: late.id } })).count.toFixed(
			3
		),
		'0.000'
	)
	assert.equal(
		await prisma.stopList.count({ where: { idDish: dish.id, type: 'AUTO' } }),
		1
	)
	assert.equal(
		(await call('get', '/menu')).find((item) => item.id === dish.id).isStopped,
		true
	)
	console.log(
		`PASS: ${checks} waiter API checks + DB assertions; merged modules, trash/restore, dynamic AUTO, MANUAL, FEFO, order journals, expired stock and concurrent orders.`
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
