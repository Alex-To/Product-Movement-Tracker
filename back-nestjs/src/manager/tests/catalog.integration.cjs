// Run from back-nestjs: node src/manager/tests/catalog.integration.cjs
// Creates and drops only a unique manager_test_* schema on local PostgreSQL.
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { spawnSync } = require('node:child_process')
const path = require('node:path')
require('dotenv').config()

const url = new URL(process.env.DATABASE_URL)
assert(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Integration tests require a local database')
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
	const setup = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--schema', path.resolve('prisma/schema.prisma'), '--skip-generate'], { env: process.env, encoding: 'utf8' })
	if (setup.status !== 0) throw new Error('Could not initialize isolated test schema: ' + setup.stderr)
	app = await NestFactory.create(AppModule, { logger: ['error'] })
	app.setGlobalPrefix('api')
	await app.init()
	const jwt = app.get(JwtService)
	const users = {}
	const tokens = {}
	for (const role of ['MANAGER', 'ADMIN', 'KITCHEN', 'WAITER']) {
		users[role] = await prisma.user.create({ data: { login: role.toLowerCase(), name: role, role, password: 'unused-for-token-tests' } })
		tokens[role] = jwt.sign({ id: users[role].id, role }, { expiresIn: '10m' })
	}
	const call = async (method, route, body, role = 'MANAGER', expected = 200) => {
		let query = request(app.getHttpServer())[method]('/api/manager' + route)
		if (role) query = query.set('Authorization', 'Bearer ' + tokens[role])
		if (body !== undefined) query = query.send(body)
		const response = await query
		assert.equal(response.status, expected, `${method} ${route} (${role}): ${JSON.stringify(response.body)}`)
		checks++
		return response.body
	}
	const protectedRoutes = [
		['get', '/products'], ['get', '/units'], ['get', '/products/name-check?name=test'],
		['post', '/products', { name: 'test', unitId: 'missing' }], ['patch', '/products/missing', { name: 'test', unitId: 'missing' }],
		['delete', '/products/missing'], ['post', '/units', { name: 'test' }], ['delete', '/units/missing']
	]
	for (const role of [null, 'ADMIN', 'KITCHEN', 'WAITER']) {
		for (const [method, route, body] of protectedRoutes) await call(method, route, body, role, role ? 403 : 401)
	}
	const kg = await call('post', '/units', { name: '  кг  ' }, 'MANAGER', 201)
	assert.equal(kg.name, 'кг')
	await call('post', '/units', { name: ' КГ ' }, 'MANAGER', 409)
	await call('post', '/units', { name: '   ' }, 'MANAGER', 400)
	const unitRequests = await Promise.all(['л', 'Л'].map(name => request(app.getHttpServer()).post('/api/manager/units').set('Authorization', 'Bearer ' + tokens.MANAGER).send({ name })))
	assert.deepEqual(unitRequests.map(r => r.status).sort(), [201, 409])
	checks++
	const litres = unitRequests.find(r => r.status === 201).body
	const piece = await call('post', '/units', { name: 'шт' }, 'MANAGER', 201)
	const first = (await call('post', '/products', { name: '  Сливки   33%  ', unitId: kg.id }, 'MANAGER', 201)).product
	assert.equal(first.name, 'Сливки 33%')
	const duplicate = await call('post', '/products', { name: 'сливки 33%', unitId: kg.id }, 'MANAGER', 201)
	assert.equal(duplicate.warnings.length, 1)
	const nameCheck = await call('get', '/products/name-check?' + new URLSearchParams({ name: 'СЛИВКИ   33%', excludeId: first.id }))
	assert.equal(nameCheck.matches, 1)
	for (const body of [
		{ name: '   ', unitId: kg.id }, { name: null, unitId: kg.id },
		{ name: 'x'.repeat(151), unitId: kg.id }, { name: 'test', unitId: 'missing' },
		{ name: 'test', unitId: kg.id, count: 100 }
	]) await call('post', '/products', body, 'MANAGER', 400)
	await call('get', '/products?page=0', undefined, 'MANAGER', 400)
	await call('get', '/products?pageSize=101', undefined, 'MANAGER', 400)
	const changed = await call('patch', '/products/' + first.id, { name: 'Сливки 33%', unitId: litres.id })
	assert.equal(changed.product.unit.id, litres.id)
	await call('delete', '/units/' + litres.id, undefined, 'MANAGER', 409)
	const delivery = await prisma.delivery.create({ data: { number: 'TEST-1', createrId: users.MANAGER.id } })
	const now = Date.now()
	await prisma.batch.createMany({ data: [
		{ idProduct: first.id, idDelivery: delivery.id, count: '0.100', EXP: new Date(now + 86400000) },
		{ idProduct: first.id, idDelivery: delivery.id, count: '0.200', EXP: new Date(now + 172800000) },
		{ idProduct: first.id, idDelivery: delivery.id, count: '9.000', EXP: new Date(now - 1000) }
	] })
	const found = await call('get', '/products?' + new URLSearchParams({ search: 'СЛИВКИ 33%', unitId: litres.id }))
	assert.equal(found.total, 1)
	assert.equal(found.items[0].availableQuantity, '0.300')
	assert.equal(found.items[0].canChangeUnit, false)
	assert.equal(found.items[0].canDelete, false)
	await call('patch', '/products/' + first.id, { name: 'Сливки', unitId: kg.id }, 'MANAGER', 409)
	await call('patch', '/products/' + first.id, { name: 'Сливки новые', unitId: litres.id })
	await call('delete', '/products/' + first.id, undefined, 'MANAGER', 409)
	const dish = await prisma.dish.create({ data: { name: 'Тестовое блюдо', ingredients: { create: { idProduct: duplicate.product.id, count: '0.100' } } } })
	await call('patch', '/products/' + duplicate.product.id, { name: 'Сливки', unitId: litres.id }, 'MANAGER', 409)
	await call('delete', '/products/' + duplicate.product.id, undefined, 'MANAGER', 409)
	const unused = (await call('post', '/products', { name: 'Удаляемый', unitId: piece.id }, 'MANAGER', 201)).product
	await call('delete', '/products/' + unused.id, undefined, 'MANAGER', 204)
	await call('delete', '/units/' + piece.id, undefined, 'MANAGER', 204)
	await call('delete', '/products/' + unused.id, undefined, 'MANAGER', 404)
	await call('patch', '/products/missing', { name: 'Тест', unitId: kg.id }, 'MANAGER', 404)
	await prisma.product.createMany({ data: Array.from({ length: 27 }, (_, i) => ({ nameProduct: 'Пагинация ' + String(i).padStart(2, '0'), idUnit: kg.id })) })
	const paginated = await call('get', '/products?' + new URLSearchParams({ search: 'Пагинация', page: '2' }))
	assert.equal(paginated.total, 27)
	assert.equal(paginated.items.length, 2)
	assert.equal(paginated.items[0].name, 'Пагинация 25')
	assert(await prisma.dish.findUnique({ where: { id: dish.id } }))
	assert.equal(await prisma.stockMovement.count(), 0, 'Catalog must not create stock movements')
	console.log(`PASS: ${checks} API checks; role isolation, validation, duplicates, concurrent units, references, stock precision and pagination.`)
}

run().catch(error => { console.error(error.message); process.exitCode = 1 }).finally(async () => {
	if (app) {
		const clients = app.get(PrismaService, { each: true })
		await app.close()
		await Promise.all(clients.map(client => client.$disconnect()))
	}
	try {
		assert(/^manager_test_[a-f0-9]{32}$/.test(schema))
		await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
		console.log('Isolated test schema removed.')
	} finally { await prisma.$disconnect() }
})
