// Run from back-nestjs: node src/manager/tests/dishes.integration.cjs
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
		tokens = {},
		users = {}
	for (const role of ['MANAGER', 'ADMIN', 'KITCHEN', 'WAITER']) {
		users[role] = await prisma.user.create({
			data: { login: role, name: role, password: 'unused', role }
		})
		tokens[role] = jwt.sign({ id: users[role].id, role }, { expiresIn: '10m' })
	}
	const call = async (
		method,
		route,
		body,
		expected = 200,
		role = 'MANAGER'
	) => {
		let req = request(app.getHttpServer())[method](
			'/api/manager/dishes' + route
		)
		if (role) req = req.set('Authorization', 'Bearer ' + tokens[role])
		if (body !== undefined) req = req.send(body)
		const res = await req
		assert.equal(
			res.status,
			expected,
			`${method} ${route} ${JSON.stringify(res.body)}`
		)
		checks++
		return res.body
	}
	for (const role of [null, 'ADMIN', 'KITCHEN', 'WAITER'])
		for (const [method, route, body] of [
			['get', ''],
			['get', '/name-check?name=test'],
			['get', '/missing'],
			['post', '', {}],
			['patch', '/missing', {}],
			['patch', '/missing/trash', { version: 1 }],
			['patch', '/missing/restore', { version: 1 }]
		])
			await call(method, route, body, role ? 403 : 401, role)
	const unit = await prisma.unit.create({ data: { name: 'кг' } }),
		otherUnit = await prisma.unit.create({ data: { name: 'л' } })
	const product = await prisma.product.create({
			data: { nameProduct: 'Помидоры', idUnit: unit.id }
		}),
		second = await prisma.product.create({
			data: { nameProduct: 'Огурцы', idUnit: unit.id }
		})
	const ingredient = {
			productId: product.id,
			unitId: unit.id,
			quantity: '0.100'
		},
		input = { name: '  Салат   свежий ', ingredients: [ingredient] }
	const invalid = [
		{ ...input, ingredients: [] },
		{ ...input, name: '   ' },
		{ ...input, ingredients: [ingredient, ingredient] },
		{ ...input, ingredients: [{ ...ingredient, quantity: '0' }] },
		{ ...input, ingredients: [{ ...ingredient, quantity: '-1' }] },
		{ ...input, ingredients: [{ ...ingredient, quantity: '0.0001' }] },
		{ ...input, ingredients: [{ ...ingredient, quantity: 1 }] },
		{ ...input, ingredients: [{ ...ingredient, productId: 'missing' }] },
		{
			...input,
			ingredients: [ingredient, { ...ingredient, productId: 'missing' }]
		},
		{ ...input, ingredients: [{ ...ingredient, unitId: undefined }] },
		{ ...input, extra: true }
	]
	for (const body of invalid) await call('post', '', body, 400)
	await call(
		'post',
		'',
		{ ...input, ingredients: [{ ...ingredient, unitId: otherUnit.id }] },
		409
	)
	assert.equal(await prisma.dish.count(), 0)
	assert.equal(await prisma.dishIngredient.count(), 0)
	assert.equal(await prisma.stopList.count(), 0)
	const first = (await call('post', '', input, 201)).dish
	assert.equal(first.name, 'Салат свежий')
	assert.equal(first.version, 1)
	assert.equal(first.portions, 0)
	assert(first.autoStop)
	assert.equal(
		await prisma.stopList.count({ where: { idDish: first.id, type: 'AUTO' } }),
		1
	)
	const duplicated = await call(
		'post',
		'',
		{ ...input, name: 'салат свежий' },
		201
	)
	assert.equal(duplicated.warnings.length, 1)
	assert.equal(
		(
			await call(
				'get',
				'/name-check?' +
					new URLSearchParams({ name: 'САЛАТ свежий', excludeId: first.id })
			)
		).matches,
		1
	)
	await call('get', '?scope=bad', undefined, 400)
	await call('get', '?page=0', undefined, 400)
	await call('get', '/missing', undefined, 404)
	const delivery = await prisma.delivery.create({
			data: { number: 'fixture', createrId: users.MANAGER.id }
		}),
		future = new Date(Date.now() + 86400000).toISOString()
	await prisma.batch.createMany({
		data: [
			{
				idProduct: product.id,
				idDelivery: delivery.id,
				count: '0.100',
				EXP: future
			},
			{
				idProduct: product.id,
				idDelivery: delivery.id,
				count: '0.200',
				EXP: future
			},
			{
				idProduct: product.id,
				idDelivery: delivery.id,
				count: '99',
				EXP: new Date(Date.now() - 1000)
			}
		]
	})
	assert.equal((await call('get', '/' + first.id)).portions, 3)
	assert.equal(
		await prisma.stopList.count({ where: { idDish: first.id, type: 'AUTO' } }),
		1,
		'GET computes availability without writing stale AUTO'
	)
	await prisma.stopList.create({
		data: { idDish: first.id, type: 'MANUAL', createrId: users.KITCHEN.id }
	})
	const edit = (
		await call('patch', '/' + first.id, {
			name: 'Салат',
			version: 1,
			ingredients: [{ ...ingredient, quantity: '0,150' }]
		})
	).dish
	assert.equal(edit.version, 2)
	assert.equal(edit.portions, 2)
	assert(!edit.autoStop)
	assert(edit.manualStop)
	assert.equal(
		await prisma.stopList.count({ where: { idDish: first.id, type: 'AUTO' } }),
		0
	)
	const amountBefore = (
		await prisma.batch.aggregate({ _sum: { count: true } })
	)._sum.count.toString()
	await call(
		'patch',
		'/' + first.id,
		{ name: 'stale', version: 1, ingredients: [ingredient] },
		409
	)
	await call(
		'patch',
		'/' + first.id,
		{
			name: 'bad',
			version: 2,
			ingredients: [{ ...ingredient, productId: 'missing' }]
		},
		400
	)
	const unchanged = await call('get', '/' + first.id)
	assert.equal(unchanged.name, 'Салат')
	assert.equal(unchanged.version, 2)
	assert.equal(unchanged.ingredients[0].quantity, '0.150')
	const races = await Promise.all(
		['Первый', 'Второй'].map((name) =>
			request(app.getHttpServer())
				.patch('/api/manager/dishes/' + first.id)
				.set('Authorization', 'Bearer ' + tokens.MANAGER)
				.send({ name, version: 2, ingredients: [ingredient] })
		)
	)
	assert.deepEqual(races.map((res) => res.status).sort(), [200, 409])
	checks++
	const current = await call('get', '/' + first.id)
	assert.equal(current.version, 3)
	const trashed = (
		await call('patch', '/' + first.id + '/trash', { version: 3 })
	).dish
	assert(trashed.deletedAt)
	assert.equal(trashed.version, 4)
	assert.equal(
		await prisma.dishIngredient.count({ where: { idDish: first.id } }),
		1
	)
	assert.equal(
		await prisma.stopList.count({
			where: { idDish: first.id, type: 'MANUAL' }
		}),
		1
	)
	assert.equal(
		(await call('get', '')).items.some((item) => item.id === first.id),
		false
	)
	assert(
		(await call('get', '?scope=trash')).items.some(
			(item) => item.id === first.id
		)
	)
	await call(
		'patch',
		'/' + first.id,
		{ name: 'forbidden', version: 4, ingredients: [ingredient] },
		409
	)
	await call('patch', '/' + first.id + '/restore', { version: 3 }, 409)
	await prisma.batch.updateMany({
		where: { idProduct: product.id },
		data: { count: '0' }
	})
	const restored = (
		await call('patch', '/' + first.id + '/restore', { version: 4 })
	).dish
	assert.equal(restored.version, 5)
	assert.equal(restored.deletedAt, null)
	assert(restored.autoStop)
	assert(restored.manualStop)
	await call('patch', '/' + first.id + '/restore', { version: 5 }, 409)
	await call('patch', '/' + first.id + '/trash', {}, 400)
	// Archived recipes keep product references; stock mutations must not recalculate archived AUTO.
	await call('patch', '/' + first.id + '/trash', { version: 5 })
	await prisma.stopList.deleteMany({
		where: { idDish: first.id, type: 'AUTO' }
	})
	const { refreshAutoStops } = require('../../inventory/availability')
	await prisma.$transaction((tx) =>
		refreshAutoStops(tx, { ingredients: { some: { idProduct: product.id } } })
	)
	assert.equal(
		await prisma.stopList.count({ where: { idDish: first.id, type: 'AUTO' } }),
		0
	)
	const { KitchenService } = require('../../kitchen/kitchen.service')
	const kitchen = app.get(KitchenService),
		kitchenList = await kitchen.getStopList()
	assert(!kitchenList.some((item) => item.id === first.id))
	await assert.rejects(() => kitchen.setManualStop(first.id, users.KITCHEN.id))
	assert(
		kitchenList
			.find((item) => item.id === duplicated.dish.id)
			.stops.some((stop) => stop.type === 'AUTO')
	)
	const recipeChanged = (
		await call('patch', '/' + duplicated.dish.id, {
			version: 1,
			name: 'Салат 2',
			ingredients: [
				{ productId: second.id, unitId: unit.id, quantity: '0.010' }
			]
		})
	).dish
	assert.equal(recipeChanged.ingredients.length, 1)
	assert.equal(recipeChanged.ingredients[0].productId, second.id)
	assert.equal(await prisma.stockMovement.count(), 0)
	assert.equal(
		(
			await prisma.batch.aggregate({ _sum: { count: true } })
		)._sum.count.toString(),
		'0'
	)
	await prisma.dish.createMany({
		data: Array.from({ length: 26 }, (_, i) => ({ name: 'Пагинация ' + i }))
	})
	const paged = await call(
		'get',
		'?search=' + encodeURIComponent('Пагинация') + '&page=2'
	)
	assert.equal(paged.total, 26)
	assert.equal(paged.items.length, 1)
	const kitchenBatch = await prisma.batch.create({ data: { idProduct: second.id, idDelivery: delivery.id, count: '0.020', EXP: future } })
	await kitchen.writeOff(users.KITCHEN.id, { batchId: kitchenBatch.id, count: '0.010' })
	assert.equal(await prisma.stopList.count({ where: { idDish: recipeChanged.id, type: 'AUTO' } }), 0)
	await kitchen.writeOff(users.KITCHEN.id, { batchId: kitchenBatch.id, count: '0.010' })
	assert.equal(await prisma.stopList.count({ where: { idDish: recipeChanged.id, type: 'AUTO' } }), 1)
	assert.equal(await prisma.stockMovement.count(), 2)
	assert.equal(await prisma.message.count(), 2)
	console.log(
		`PASS: ${checks} dish API checks; migration, manager roles, recipes without stock, validation, Decimal portions, expired stock, CAS/concurrent edits, rollback, trash/restore, MANUAL preservation and kitchen integration.`
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
