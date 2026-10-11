// Run from back-nestjs: node src/manager/tests/deliveries.integration.cjs
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
	if (setup.status !== 0)
		throw new Error(
			'Could not deploy migrations to isolated schema: ' + setup.stderr
		)
	app = await NestFactory.create(AppModule, { logger: ['error'] })
	app.setGlobalPrefix('api')
	await app.init()
	const tokens = {},
		users = {},
		jwt = app.get(JwtService)
	for (const role of ['MANAGER', 'ADMIN', 'KITCHEN', 'WAITER']) {
		users[role] = await prisma.user.create({
			data: { login: role.toLowerCase(), name: role, role, password: 'unused' }
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
		let req = request(app.getHttpServer())[method]('/api/manager' + route)
		if (role) req = req.set('Authorization', 'Bearer ' + tokens[role])
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
	for (const role of [null, 'ADMIN', 'KITCHEN', 'WAITER']) {
		for (const [method, route, body] of [
			['get', '/suppliers'],
			['post', '/suppliers', { name: 'Тест' }],
			['get', '/deliveries'],
			['get', '/deliveries/missing'],
			['post', '/deliveries', {}]
		])
			await call(method, route, body, role ? 403 : 401, role)
	}
	const supplier = await call(
		'post',
		'/suppliers',
		{ name: '  Ферма   Юг  ' },
		201
	)
	assert.equal(supplier.name, 'Ферма Юг')
	await call('post', '/suppliers', { name: 'ферма юг' }, 409)
	await call('post', '/suppliers', { name: '   ' }, 400)
	await call('post', '/suppliers', { name: 'Тест', admin: true }, 400)
	const racingSuppliers = await Promise.all(
		['Молоко', 'молоко'].map((name) =>
			request(app.getHttpServer())
				.post('/api/manager/suppliers')
				.set('Authorization', 'Bearer ' + tokens.MANAGER)
				.send({ name })
		)
	)
	assert.deepEqual(racingSuppliers.map((r) => r.status).sort(), [201, 409])
	checks++
	const secondSupplier = racingSuppliers.find((r) => r.status === 201).body
	const unit = await prisma.unit.create({ data: { name: 'кг' } })
	const product = await prisma.product.create({
		data: { nameProduct: 'Помидоры', idUnit: unit.id }
	})
	const secondProduct = await prisma.product.create({
		data: { nameProduct: 'Огурцы', idUnit: unit.id }
	})
	const future = new Date(Date.now() + 86400000 * 30).toISOString(),
		later = new Date(Date.now() + 86400000 * 60).toISOString()
	const line = {
		productId: product.id,
		unitId: unit.id,
		quantity: '0.100',
		expiresAt: future
	}
	const input = (overrides = {}) => ({
		requestId: randomUUID(),
		supplierId: supplier.id,
		number: randomUUID(),
		lines: [line],
		...overrides
	})
	const badBodies = [
		{ lines: [] },
		{ lines: Array.from({ length: 101 }, () => line) },
		{ lines: [{ ...line, quantity: '0' }] },
		{ lines: [{ ...line, quantity: '-1' }] },
		{ lines: [{ ...line, quantity: '0.0001' }] },
		{ lines: [{ ...line, quantity: '1000000000' }] },
		{ lines: [{ ...line, quantity: 1 }] },
		{
			lines: [{ ...line, expiresAt: new Date(Date.now() - 1000).toISOString() }]
		},
		{ lines: [{ ...line, expiresAt: '2029-01-01' }] },
		{ lines: [{ ...line, expiresAt: '2029-01-01T12:00:00' }] },
		{ lines: [{ ...line, productId: 'missing' }] },
		{ supplierId: 'missing' },
		{ number: '   ' },
		{ requestId: 'invalid' },
		{ createrId: users.ADMIN.id },
		{ lines: [{ ...line, unitId: undefined }] },
		{ lines: [line, { ...line, quantity: '0' }] },
		{ lines: [line, { ...line, productId: 'missing' }] }
	]
	for (const override of badBodies)
		await call('post', '/deliveries', input(override), 400)
	await call(
		'post',
		'/deliveries',
		input({ lines: [{ ...line, unitId: 'changed-unit' }] }),
		409
	)
	assert.equal(await prisma.delivery.count(), 0)
	assert.equal(await prisma.batch.count(), 0)
	const dish = await prisma.dish.create({
		data: {
			name: 'Салат',
			ingredients: {
				create: [
					{ idProduct: product.id, count: '0.200' },
					{ idProduct: secondProduct.id, count: '1.000' }
				]
			},
			stopLists: {
				create: [
					{ type: 'AUTO' },
					{ type: 'MANUAL', createrId: users.KITCHEN.id }
				]
			}
		}
	})
	const data = input({
		number: '  Н-100  ',
		lines: [
			line,
			{ ...line, quantity: '0,200', expiresAt: later },
			{ ...line, productId: secondProduct.id, quantity: '3.125' }
		]
	})
	const received = await call('post', '/deliveries', data, 201)
	assert.equal(
		await prisma.stopList.count({ where: { idDish: dish.id, type: 'AUTO' } }),
		0
	)
	assert.equal(
		await prisma.stopList.count({ where: { idDish: dish.id, type: 'MANUAL' } }),
		1
	)
	assert.equal(received.number, 'Н-100')
	assert.equal(received.creater.id, users.MANAGER.id)
	assert.equal(received.batches.length, 3)
	assert.equal(received.supplier.id, supplier.id)
	assert(
		Math.abs(Date.now() - new Date(received.createDate).getTime()) < 10000,
		'Empty receipt date defaults to confirmation time'
	)
	const manualDate = new Date(Date.now() - 3 * 86400000).toISOString()
	const manualInput = input({ receivedAt: manualDate })
	const manual = await call('post', '/deliveries', manualInput, 201)
	assert.equal(manual.createDate, manualDate)
	assert.equal(
		(await call('post', '/deliveries', manualInput, 201)).id,
		manual.id
	)
	await call(
		'post',
		'/deliveries',
		{
			...manualInput,
			receivedAt: new Date(Date.now() - 86400000).toISOString()
		},
		409
	)
	await call('post', '/deliveries', input({ receivedAt: future }), 400)
	await call('post', '/deliveries', input({ receivedAt: 'invalid' }), 400)
	await call('post', '/deliveries', input({ receivedAt: '2026-01-01' }), 400)
	assert.equal(
		(
			await prisma.batch.aggregate({
				where: { idProduct: product.id, idDelivery: received.id },
				_sum: { count: true }
			})
		)._sum.count.toFixed(3),
		'0.300'
	)
	const replay = await call('post', '/deliveries', data, 201)
	assert.equal(replay.id, received.id)
	assert.equal(await prisma.batch.count({ where: { idDelivery: received.id } }), 3)
	await call('post', '/deliveries', { ...data, number: 'changed' }, 409)
	await call('post', '/deliveries', { ...data, requestId: randomUUID() }, 409)
	const differentSupplier = await call(
		'post',
		'/deliveries',
		{ ...data, requestId: randomUUID(), supplierId: secondSupplier.id },
		201
	)
	assert.notEqual(differentSupplier.id, received.id)
	const concurrent = input({ number: 'race-same-request' })
	const race = await Promise.all(
		[1, 2].map(() =>
			request(app.getHttpServer())
				.post('/api/manager/deliveries')
				.set('Authorization', 'Bearer ' + tokens.MANAGER)
				.send(concurrent)
		)
	)
	assert.deepEqual(
		race.map((r) => r.status),
		[201, 201]
	)
	assert.equal(race[0].body.id, race[1].body.id)
	checks++
	const raceDifferent = await Promise.all(
		[1, 2].map(() =>
			request(app.getHttpServer())
				.post('/api/manager/deliveries')
				.set('Authorization', 'Bearer ' + tokens.MANAGER)
				.send(input({ number: 'race-invoice' }))
		)
	)
	assert.deepEqual(raceDifferent.map((r) => r.status).sort(), [201, 409])
	checks++
	const firstBatch = received.batches.find((b) => b.idProduct === product.id)
	await prisma.batch.update({
		where: { id: firstBatch.id },
		data: { count: '0' }
	})
	await prisma.product.update({
		where: { id: product.id },
		data: { nameProduct: 'Новое название' }
	})
	const saved = await call('get', '/deliveries/' + received.id)
	const savedBatch = saved.batches.find((b) => b.id === firstBatch.id)
	assert.equal(savedBatch.count, '0')
	assert.equal(savedBatch.receivedCount, firstBatch.receivedCount)
	assert.equal(savedBatch.productNameAtReceipt, 'Помидоры')
	assert.equal(savedBatch.unitNameAtReceipt, 'кг')
	await call('patch', '/deliveries/' + received.id, {}, 404)
	await call('delete', '/deliveries/' + received.id, undefined, 404)
	await call('get', '/deliveries/missing', undefined, 404)
	const searched = await call(
		'get',
		'/deliveries?' + new URLSearchParams({ search: 'Н-100' })
	)
	assert.equal(searched.total, 2)
	const supplierSearch = await call(
		'get',
		'/deliveries?' + new URLSearchParams({ search: 'ферма' })
	)
	assert(supplierSearch.total > 0)
	await call('get', '/deliveries?page=0', undefined, 400)
	await prisma.delivery.createMany({
		data: Array.from({ length: 26 }, (_, i) => ({
			number: 'legacy-' + i,
			createrId: users.MANAGER.id
		}))
	})
	const paged = await call('get', '/deliveries?search=legacy&page=2')
	assert.equal(paged.total, 26)
	assert.equal(paged.items.length, 1)
	assert.equal(paged.items[0].supplier, null)
	const raceProducts = await Promise.all(
		['A', 'B'].map((name) =>
			prisma.product.create({
				data: { nameProduct: 'Одновременно ' + name, idUnit: unit.id }
			})
		)
	)
	const raceDish = await prisma.dish.create({
		data: {
			name: 'Одновременный рецепт',
			ingredients: {
				create: raceProducts.map((product) => ({
					idProduct: product.id,
					count: '1.000'
				}))
			},
			stopLists: { create: { type: 'AUTO' } }
		}
	})
	const receipts = await Promise.all(
		raceProducts.map((product) =>
			request(app.getHttpServer())
				.post('/api/manager/deliveries')
				.set('Authorization', 'Bearer ' + tokens.MANAGER)
				.send(
					input({
						lines: [{ ...line, productId: product.id, quantity: '1.000' }]
					})
				)
		)
	)
	assert.deepEqual(
		receipts.map((response) => response.status),
		[201, 201]
	)
	assert.equal(
		await prisma.stopList.count({
			where: { idDish: raceDish.id, type: 'AUTO' }
		}),
		0
	)
	checks++
	assert.equal(
		await prisma.stockMovement.count(),
		0,
		'Receipts must not enter write-off history'
	)
	console.log(
		`PASS: ${checks} delivery API checks; migrations, roles, atomic validation, supplier uniqueness, decimal precision, repeat/concurrent requests, invoice uniqueness, immutable receipt quantities and snapshots, history and pagination.`
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
