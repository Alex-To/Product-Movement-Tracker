// Run from back-nestjs. Uses only an isolated local PostgreSQL schema.
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { spawnSync } = require('node:child_process')
require('dotenv').config()
const url = new URL(process.env.DATABASE_URL)
assert(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
const schema = 'manager_test_' + randomUUID().replaceAll('-', '')
url.searchParams.set('schema', schema)
process.env.DATABASE_URL = url.toString()
require('ts-node/register/transpile-only')
require('tsconfig-paths/register')
require('reflect-metadata')
const { PrismaClient } = require('@prisma/client')
const { NestFactory } = require('@nestjs/core')
const { JwtService } = require('@nestjs/jwt')
const { AppModule } = require('../../app.module')
const { PrismaService } = require('../../prisma.service')
const request = require('supertest')
const p = new PrismaClient()
let app,
	checks = 0
async function run() {
	const setup = spawnSync(
		process.execPath,
		[require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
		{ env: process.env, encoding: 'utf8' }
	)
	assert.equal(setup.status, 0, setup.stderr)
	app = await NestFactory.create(AppModule, { logger: ['error'] })
	app.setGlobalPrefix('api')
	app.use(require('cookie-parser')())
	await app.listen(0, '127.0.0.1')
	const users = {},
		tokens = {},
		jwt = app.get(JwtService)
	for (const role of ['MANAGER', 'ADMIN', 'KITCHEN', 'WAITER']) {
		users[role] = await p.user.create({
			data: { login: role, name: role, role, password: 'unused' }
		})
		tokens[role] = jwt.sign(
			{ id: users[role].id, role, type: 'access' },
			{ expiresIn: '10m' }
		)
	}
	const manager = '/api/manager/external-interfaces',
		external = '/api/external/v1'
	const call = async (method, path, body, credential, status = 200) => {
		let q = request(app.getHttpServer())[method](path)
		if (credential?.startsWith('eif_')) q = q.set('X-API-Key', credential)
		else if (credential) q = q.set('Authorization', 'Bearer ' + credential)
		if (body !== undefined) q = q.send(body)
		const response = await q
		assert.equal(
			response.status,
			status,
			method + ' ' + path + ': ' + JSON.stringify(response.body)
		)
		checks++
		return response.body
	}
	const m = tokens.MANAGER
	await call('get', external + '/products', undefined, undefined, 401)
	await call('get', external + '/suppliers', undefined, m, 401)
	for (const role of ['ADMIN', 'KITCHEN', 'WAITER'])
		await call('post', manager, { name: 'Forbidden' }, tokens[role], 403)
	await call('post', manager, { name: '   ' }, m, 400)
	const source = await call('post', manager, { name: 'Integration A' }, m, 201)
	const other = await call('post', manager, { name: 'Integration B' }, m, 201)
	assert(source.key.startsWith(source.prefix + '_'))
	const stored = await p.externalInterface.findUnique({
		where: { id: source.id }
	})
	assert(!JSON.stringify(stored).includes(source.key))
	assert.equal(stored.keyHash.length, 64)
	assert(stored.encryptedKey && !stored.encryptedKey.includes(source.key))
	assert.equal(
		(await call('get', manager + '/' + source.id + '/key', undefined, m)).key,
		source.key
	)
	await call(
		'get',
		manager + '/' + source.id + '/key',
		undefined,
		source.key,
		401
	)
	for (const role of ['ADMIN', 'KITCHEN', 'WAITER']) {
		await call(
			'get',
			manager + '/' + source.id + '/key',
			undefined,
			tokens[role],
			403
		)
		await call(
			'post',
			manager + '/' + source.id + '/key',
			{ key: source.key },
			tokens[role],
			403
		)
	}
	await p.externalInterface.update({
		where: { id: source.id },
		data: { encryptedKey: null }
	})
	assert.equal(
		(await call('get', manager + '/' + source.id + '/key', undefined, m)).key,
		null
	)
	await call(
		'post',
		manager + '/' + source.id + '/key',
		{ key: other.key },
		m,
		400
	)
	assert.equal(
		(
			await call(
				'post',
				manager + '/' + source.id + '/key',
				{ key: source.key },
				m,
				201
			)
		).key,
		source.key
	)
	const secretResponse = await request(app.getHttpServer())
		.get(manager + '/' + source.id + '/key')
		.set('Authorization', 'Bearer ' + m)
	assert.equal(secretResponse.headers['cache-control'], 'no-store')
	assert(
		!JSON.stringify(await call('get', manager, undefined, m)).includes(
			source.key
		)
	)
	await call('get', manager, undefined, source.key, 401)
	const unit = await p.unit.create({ data: { name: 'кг' } })
	const wrongUnit = await p.unit.create({ data: { name: 'л' } })
	const product = await p.product.create({
		data: { nameProduct: 'External rice', idUnit: unit.id }
	})
	const product2 = await p.product.create({
		data: { nameProduct: 'External flour', idUnit: unit.id }
	})
	const supplier = await p.supplier.create({
		data: { name: 'Supplier A', nameKey: 'supplier a' }
	})
	const supplier2 = await p.supplier.create({
		data: { name: 'Supplier B', nameKey: 'supplier b' }
	})
	const dish = await p.dish.create({
		data: {
			name: 'Rice dish',
			ingredients: { create: { idProduct: product.id, count: 1 } }
		}
	})
	await p.stopList.create({ data: { idDish: dish.id, type: 'AUTO' } })
	await p.stopList.create({
		data: { idDish: dish.id, type: 'MANUAL', createrId: users.MANAGER.id }
	})
	const products = await call(
		'get',
		external + '/products?search=External',
		undefined,
		source.key
	)
	assert.equal(products.total, 2)
	assert.deepEqual(Object.keys(products.items[0]).sort(), [
		'id',
		'nameProduct',
		'unit'
	])
	assert.equal(
		(await call('get', external + '/suppliers', undefined, source.key)).total,
		2
	)
	const line = {
		productId: product.id,
		unitId: unit.id,
		quantity: '10.000',
		expiresAt: new Date(Date.now() + 86400000 * 30).toISOString()
	}
	const make = (number, lines = [line], supplierId = supplier.id) => ({
		requestId: randomUUID(),
		supplierId,
		number,
		lines
	})
	const counts = async () =>
		Promise.all([
			p.delivery.count(),
			p.batch.count(),
			p.stockMovement.count(),
			p.stopList.count()
		])
	const initial = await counts()
	const input = make('EXT-1', [
		line,
		{ ...line, quantity: '5.000' },
		{ ...line, productId: product2.id, quantity: '8.000' }
	])
	const pending = await call(
		'post',
		external + '/delivery-requests',
		input,
		source.key,
		201
	)
	assert.equal(pending.status, 'PENDING')
	assert.deepEqual(await counts(), initial)
	assert.equal(
		(
			await call(
				'post',
				external + '/delivery-requests',
				{
					...input,
					lines: input.lines.map((l) => ({
						expiresAt: l.expiresAt,
						quantity: l.quantity,
						unitId: l.unitId,
						productId: l.productId
					}))
				},
				source.key,
				201
			)
		).id,
		pending.id
	)
	await call(
		'post',
		external + '/delivery-requests',
		{ ...input, number: 'changed' },
		source.key,
		409
	)
	await call(
		'post',
		external + '/delivery-requests',
		make('EXT-1'),
		other.key,
		409
	)
	await call(
		'get',
		external + '/delivery-requests/' + pending.id,
		undefined,
		other.key,
		404
	)
	assert.equal(
		(
			await call(
				'get',
				external + '/delivery-requests?interfaceId=' + source.id,
				undefined,
				other.key
			)
		).total,
		0
	)
	for (const bad of [
		{ quantity: '0' },
		{ quantity: '-1' },
		{ quantity: '1.0001' },
		{ quantity: 2 },
		{ productId: 'missing' },
		{ expiresAt: '2020-01-01T00:00:00Z' },
		{ expiresAt: '2030-01-01T12:00:00' }
	])
		await call(
			'post',
			external + '/delivery-requests',
			make(randomUUID(), [{ ...line, ...bad }]),
			source.key,
			400
		)
	await call(
		'post',
		external + '/delivery-requests',
		make('unit', [{ ...line, unitId: wrongUnit.id }]),
		source.key,
		409
	)
	await call(
		'post',
		external + '/delivery-requests',
		{ ...make('extra'), receivedAt: new Date().toISOString() },
		source.key,
		400
	)
	await call(
		'post',
		external + '/delivery-requests',
		make('supplier', [line], 'missing'),
		source.key,
		400
	)
	await call(
		'delete',
		'/api/manager/products/' + product2.id,
		undefined,
		m,
		409
	)
	const accept = manager + '/requests/' + pending.id + '/accept'
	const decision = {
		lines: pending.lines.map((l, i) => ({
			lineId: l.id,
			quantity: i === 0 ? '7.000' : '0'
		}))
	}
	await call('post', accept, { lines: decision.lines.slice(0, 1) }, m, 400)
	await call(
		'post',
		accept,
		{ lines: decision.lines.map((l) => ({ ...l, quantity: '999' })) },
		m,
		400
	)
	await call(
		'post',
		accept,
		{ lines: decision.lines.map((l) => ({ ...l, quantity: '0' })) },
		m,
		400
	)
	await call(
		'post',
		accept,
		{ ...decision, receivedAt: new Date(Date.now() + 86400000).toISOString() },
		m,
		400
	)
	assert.deepEqual(await counts(), initial)
	const partial = await call('post', accept, decision, m, 201)
	assert.equal(partial.status, 'PARTIALLY_ACCEPTED')
	assert(partial.deliveryId)
	assert.deepEqual(
		partial.lines.map((l) => l.status),
		['PARTIALLY_ACCEPTED', 'REJECTED', 'REJECTED']
	)
	assert.equal(partial.lines[0].acceptedQuantity, '7')
	assert(partial.lines[0].batchId)
	assert.equal(
		Number(
			(await p.batch.findUnique({ where: { id: partial.lines[0].batchId } }))
				.count
		),
		7
	)
	assert.equal(
		await p.stopList.count({
			where: { type: 'AUTO', closedAt: null, idDish: dish.id }
		}),
		0
	)
	assert.equal(
		await p.stopList.count({
			where: { type: 'MANUAL', closedAt: null, idDish: dish.id }
		}),
		1
	)
	const after = await counts()
	assert.equal(
		(await call('post', accept, decision, m, 201)).deliveryId,
		partial.deliveryId
	)
	assert.deepEqual(await counts(), after)
	await call(
		'post',
		manager + '/requests/' + pending.id + '/reject',
		{},
		m,
		409
	)
	await call(
		'post',
		external + '/delivery-requests',
		make('EXT-1'),
		source.key,
		409
	)
	const rejected = await call(
		'post',
		external + '/delivery-requests',
		make('REJECT'),
		source.key,
		201
	)
	assert.equal(
		(
			await call(
				'post',
				manager + '/requests/' + rejected.id + '/reject',
				{},
				m,
				201
			)
		).status,
		'REJECTED'
	)
	assert.deepEqual(await counts(), after)
	const replacement = await call(
		'post',
		external + '/delivery-requests',
		make('REJECT'),
		source.key,
		201
	)
	const expired = await call(
		'post',
		external + '/delivery-requests',
		make('EXPIRE'),
		source.key,
		201
	)
	await p.externalDeliveryRequestLine.update({
		where: { id: expired.lines[0].id },
		data: { expiresAt: new Date(Date.now() - 1000) }
	})
	await call(
		'post',
		manager + '/requests/' + expired.id + '/accept',
		{ lines: [{ lineId: expired.lines[0].id, quantity: '1' }] },
		m,
		400
	)
	assert.equal(
		(await p.externalDeliveryRequest.findUnique({ where: { id: expired.id } }))
			.status,
		'PENDING'
	)
	assert.deepEqual(await counts(), after)
	const race = await call(
		'post',
		external + '/delivery-requests',
		make('RACE', [line, { ...line }]),
		source.key,
		201
	)
	const raceDecision = {
		lines: race.lines.map((l) => ({ lineId: l.id, quantity: l.quantity }))
	}
	const raceResults = await Promise.all([
		call(
			'post',
			manager + '/requests/' + race.id + '/accept',
			raceDecision,
			m,
			201
		),
		call(
			'post',
			manager + '/requests/' + race.id + '/accept',
			raceDecision,
			m,
			201
		)
	])
	assert.equal(raceResults[0].deliveryId, raceResults[1].deliveryId)
	assert.equal(raceResults[0].status, 'ACCEPTED')
	assert.equal(new Set(raceResults[0].lines.map((l) => l.batchId)).size, 2)
	const rejectedAfter = await call(
		'post',
		external + '/delivery-requests',
		make('AFTER-REVOKE', [line], supplier2.id),
		source.key,
		201
	)
	await call('delete', manager + '/' + source.id, undefined, m)
	await call('get', external + '/products', undefined, source.key, 401)
	await call(
		'post',
		external + '/delivery-requests',
		make('REVOKED'),
		source.key,
		401
	)
	await call(
		'post',
		manager + '/requests/' + rejectedAfter.id + '/accept',
		{ lines: [{ lineId: rejectedAfter.lines[0].id, quantity: '2' }] },
		m,
		201
	)
	const available = await call(
		'get',
		manager + '/requests?status=PENDING',
		undefined,
		m
	)
	assert(available.items.some((item) => item.id === replacement.id))
	for (const role of ['ADMIN', 'KITCHEN', 'WAITER'])
		await call(
			'post',
			manager + '/' + source.id + '/restore',
			{},
			tokens[role],
			403
		)
	await call('post', manager + '/missing/restore', {}, m, 404)
	await call('delete', manager + '/' + other.id, undefined, m)
	const restored = await call(
		'post',
		manager + '/' + source.id + '/restore',
		{},
		m,
		201
	)
	assert.equal(restored.revokedAt, null)
	assert.equal(restored.prefix, source.prefix)
	assert.equal(
		(await p.externalInterface.findUnique({ where: { id: source.id } }))
			.keyHash,
		stored.keyHash
	)
	await call('get', external + '/products', undefined, source.key)
	await call('post', manager + '/' + source.id + '/restore', {}, m, 201)
	const ordered = await call('get', manager, undefined, m)
	assert.deepEqual(
		ordered.items.map((item) => item.id),
		[source.id, other.id]
	)
	console.log(
		`PASS ${checks} HTTP checks: isolated migration, key secrecy/revocation, roles, catalogs, no pre-approval stock, validation, idempotency, partial quantities, final decisions, expired pending, concurrent approvals, AUTO/MANUAL stops, supplier choice`
	)
	if (process.env.EXTERNAL_BROWSER === '1')
		await browserTest({ app, p, users, tokens, other, replacement })
}
async function browserTest({ app, p, users, tokens, other, replacement }) {
	const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
	const browser = await chromium.launch({ headless: true, channel: 'msedge' })
	try {
		const page = await browser.newPage({
				viewport: { width: 1440, height: 1000 }
			}),
			errors = []
		page.on('pageerror', (e) => errors.push(e.message))
		const jwt = app.get(JwtService)
		await page.context().addCookies([
			{
				name: 'accessToken',
				value: tokens.MANAGER,
				domain: 'localhost',
				path: '/'
			},
			{
				name: 'refreshToken',
				value: jwt.sign(
					{ id: users.MANAGER.id, role: 'MANAGER', type: 'refresh' },
					{ expiresIn: '10m' }
				),
				domain: 'localhost',
				path: '/'
			}
		])
		const api = 'http://127.0.0.1:' + app.getHttpServer().address().port
		await page.route(
			/http:\/\/localhost:(?:4200|3100)\/api\//,
			async (route) => {
				const headers = {
					'access-control-allow-origin': 'http://localhost:3100',
					'access-control-allow-credentials': 'true',
					'access-control-allow-headers': 'content-type,authorization',
					'access-control-allow-methods': 'GET,POST,DELETE'
				}
				if (route.request().method() === 'OPTIONS')
					return route.fulfill({ status: 204, headers })
				const response = await route.fetch({
					url: route
						.request()
						.url()
						.replace(/^http:\/\/localhost:(?:4200|3100)(?=\/api\/)/, api)
				})
				return route.fulfill({
					response,
					headers: { ...response.headers(), ...headers }
				})
			}
		)
		await page.goto('http://localhost:3100/manager/external-interfaces')
		await page
			.getByRole('heading', { name: 'Внешние интерфейсы', exact: true })
			.waitFor()
		assert.deepEqual(
			await page
				.getByRole('navigation', { name: 'Разделы менеджера' })
				.getByRole('link')
				.allTextContents(),
			[
				'Склад',
				'Статистика',
				'Блюда и рецептуры',
				'Поставки',
				'Продукты',
				'Внешние интерфейсы'
			]
		)
		await page.getByRole('button', { name: 'API-ключи', exact: true }).click()
		await page.getByLabel('Название интерфейса').fill('Browser integration')
		await page
			.getByRole('button', { name: 'Создать ключ', exact: true })
			.click()
		await page.getByTestId('api-key').waitFor()
		assert((await page.getByTestId('api-key').textContent()).startsWith('eif_'))
		await page.getByRole('button', { name: 'Сохранено, закрыть' }).click()
		const savedKey = await p.externalInterface.findFirst({
			where: { name: 'Browser integration' }
		})
		await page
			.getByRole('button', {
				name: 'Показать API-ключ Browser integration',
				exact: true
			})
			.click()
		const visibleKey = await page.getByTestId('api-key').textContent()
		assert.equal(
			require('../api-key.guard').keyHash(visibleKey),
			savedKey.keyHash
		)
		const downloadPromise = page.waitForEvent('download')
		await page
			.getByRole('button', { name: 'Скачать .txt', exact: true })
			.click()
		const download = await downloadPromise
		const stream = await download.createReadStream(),
			chunks = []
		for await (const chunk of stream) chunks.push(chunk)
		assert.equal(Buffer.concat(chunks).toString('utf8'), visibleKey)
		await page
			.getByRole('button', { name: 'Закрыть окно', exact: true })
			.click()
		const inactive = page
			.getByRole('listitem')
			.filter({ hasText: 'Integration B' })
		await page.screenshot({
			path: process.env.EXTERNAL_SCREENSHOT.replace('.png', '-revoked.png'),
			fullPage: true
		})
		await inactive
			.getByRole('button', { name: 'Восстановить работу ключа', exact: true })
			.click()
		await page
			.getByRole('button', { name: 'Да, восстановить', exact: true })
			.click()
		await inactive
			.getByRole('button', { name: 'Удалить ключ', exact: true })
			.waitFor()
		await page.screenshot({
			path: process.env.EXTERNAL_SCREENSHOT.replace('.png', '-keys.png'),
			fullPage: true
		})
		await page
			.getByRole('button', { name: 'Заявки на поставку', exact: true })
			.click()
		const row = page
			.getByRole('listitem')
			.filter({ hasText: 'Накладная REJECT ·' })
		await row.getByRole('button', { name: 'Открыть заявку' }).click()
		const quantity = page.getByRole('textbox', {
			name: /Количество для External rice/
		})
		await quantity.fill('3.500')
		await page
			.getByRole('button', { name: 'Принять поставку', exact: true })
			.click()
		await page
			.getByRole('button', { name: 'Да, подтвердить', exact: true })
			.click()
		await page
			.getByRole('link', { name: 'Открыть проведённую поставку' })
			.waitFor()
		assert.equal(
			(
				await p.externalDeliveryRequest.findUnique({
					where: { id: replacement.id }
				})
			).status,
			'PARTIALLY_ACCEPTED'
		)
		await page.screenshot({
			path: process.env.EXTERNAL_SCREENSHOT,
			fullPage: true
		})
		await page.getByRole('button', { name: 'Закрыть', exact: true }).click()
		await page.setViewportSize({ width: 390, height: 844 })
		await page.evaluate(() =>
			document.documentElement.setAttribute('data-theme', 'dark')
		)
		assert(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth
			)
		)
		assert.deepEqual(errors, [])
		console.log(
			'PASS browser: create key once, pending request, partial quantity acceptance, final delivery link, mobile dark theme'
		)
	} finally {
		await browser.close()
	}
}
run()
	.catch((e) => {
		console.error(e)
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
			await p.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
		} finally {
			await p.$disconnect()
		}
	})
