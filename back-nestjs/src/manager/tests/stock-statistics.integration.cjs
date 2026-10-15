// Run from back-nestjs. Uses and removes only an isolated local test schema.
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
const { PrismaService } = require('../../prisma.service')
const { AppModule } = require('../../app.module')
const request = require('supertest')
const p = new PrismaClient()
let app
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
	const jwt = app.get(JwtService),
		users = {},
		tokens = {}
	for (const role of ['MANAGER', 'ADMIN', 'KITCHEN', 'WAITER']) {
		users[role] = await p.user.create({
			data: { login: role, name: role, role, password: 'unused' }
		})
		tokens[role] = jwt.sign(
			{ id: users[role].id, role, type: 'access' },
			{ expiresIn: '10m' }
		)
	}
	let checks = 0
	const call = async (route, status = 200, role = 'MANAGER') => {
		let req = request(app.getHttpServer()).get('/api/manager/' + route)
		if (role) req = req.set('Authorization', 'Bearer ' + tokens[role])
		const res = await req
		assert.equal(res.status, status, JSON.stringify(res.body))
		checks++
		return res.body
	}
	for (const route of [
		'statistics/forecast',
		'statistics/expiry?from=2026-10-01&to=2026-10-01'
	])
		for (const role of [null, 'ADMIN', 'KITCHEN', 'WAITER'])
			await call(route, role ? 403 : 401, role)
	for (const query of [
		'days=0',
		'days=2',
		'days=1000',
		'includeRejections=yes',
		'extra=1'
	])
		await call('statistics/forecast?' + query, 400)
	const emptyForecast = await call('statistics/forecast')
	assert.deepEqual(emptyForecast.products, [])
	assert.equal(emptyForecast.days, 14)
	assert.equal(
		+new Date(emptyForecast.historyUntil) -
			+new Date(emptyForecast.historyFrom),
		7 * 24 * 3600000
	)
	const unit = await p.unit.create({ data: { name: 'кг' } }),
		otherUnit = await p.unit.create({ data: { name: 'л' } })
	const product = await p.product.create({
		data: { nameProduct: 'Общий ингредиент', idUnit: unit.id }
	})
	const unknown = await p.product.create({
		data: { nameProduct: 'Без истории', idUnit: otherUnit.id }
	})
	const now = Date.now(),
		hour = 3600000
	const delivery = await p.delivery.create({
		data: {
			number: 'TEST',
			createrId: users.MANAGER.id,
			createDate: new Date(now - 48 * hour)
		}
	})
	const batch = async (id, productId, count, expires) =>
		p.batch.create({
			data: {
				id,
				idProduct: productId,
				idDelivery: delivery.id,
				count,
				EXP: new Date(expires)
			}
		})
	await batch('soon', product.id, '10', now + 2 * hour)
	await batch('later', product.id, '20', now + 240 * hour)
	await batch('unknown', unknown.id, '4', now + hour)
	await batch(
		'expired-history',
		product.id,
		'0',
		Date.parse('2026-09-30T20:00:00Z')
	)
	await batch(
		'other-history',
		unknown.id,
		'0',
		Date.parse('2099-01-01T00:00:00Z')
	)
	const dishes = []
	for (const name of ['Первое блюдо', 'Второе блюдо'])
		dishes.push(
			await p.dish.create({
				data: {
					name,
					ingredients: { create: { idProduct: product.id, count: '0.500' } }
				}
			})
		)
	const accepted = await p.order.create({
		data: {
			number: 1,
			createrId: users.WAITER.id,
			createDate: new Date(now - 24 * hour),
			items: { create: dishes.map((dish) => ({ idDish: dish.id, count: 168 })) }
		}
	})
	const archived = await p.dish.create({
		data: {
			name: 'В корзине',
			deletedAt: new Date(),
			ingredients: { create: { idProduct: product.id, count: '99' } }
		}
	})
	await p.orderItem.create({
		data: { idOrder: accepted.id, idDish: archived.id, count: 999 }
	})
	// Full recipes are used even when an ingredient was excluded from an order.
	const acceptedLine = await p.orderItem.findFirst({
		where: { idOrder: accepted.id, idDish: dishes[0].id }
	})
	await p.orderItemExclusion.create({
		data: { idOrderItem: acceptedLine.id, idProduct: product.id }
	})
	// Today and the instant before the history start must not affect procurement.
	for (const date of [
		new Date(emptyForecast.historyUntil),
		new Date(+new Date(emptyForecast.historyFrom) - 1)
	]) {
		await p.order.create({
			data: {
				number: 2,
				createrId: users.WAITER.id,
				createDate: date,
				items: { create: { idDish: dishes[0].id, count: 99999 } }
			}
		})
	}
	await p.orderRejection.create({
		data: {
			reason: 'SHORTAGE',
			createDate: new Date(+new Date(emptyForecast.historyUntil) - hour),
			waiterName: 'Тест',
			lines: [
				{
					dishId: dishes[0].id,
					dishName: dishes[0].name,
					count: 84,
					blocked: true,
					excluded: []
				},
				{ dishId: dishes[1].id, count: 999, blocked: false }
			],
			details: {}
		}
	})
	await p.orderRejection.create({
		data: {
			reason: 'BUSY',
			createDate: new Date(+new Date(emptyForecast.historyUntil) - hour),
			waiterName: 'Тест',
			lines: [{ dishId: dishes[0].id, count: 9999, blocked: true }],
			details: {}
		}
	})
	const movement = async (
		id,
		idBatch,
		count,
		createrId,
		date,
		idOrder = null
	) =>
		p.stockMovement.create({
			data: {
				id,
				idBatch,
				count,
				createrId,
				createDate: new Date(date),
				idOrder
			}
		})
	const automatic = await movement(
		'auto',
		'expired-history',
		'1.250',
		null,
		'2026-09-30T21:00:00Z'
	)
	await movement(
		'manual',
		'expired-history',
		'0.500',
		users.MANAGER.id,
		'2026-10-01T20:59:59.999Z'
	)
	await movement(
		'other',
		'other-history',
		'2.250',
		users.MANAGER.id,
		'2026-10-01T10:00:00Z'
	)
	await movement(
		'outside',
		'expired-history',
		'100',
		null,
		'2026-10-01T21:00:00Z'
	)
	await movement(
		'sale',
		'other-history',
		'99',
		users.WAITER.id,
		'2026-10-01T10:00:00Z',
		accepted.id
	)
	await p.message.createMany({
		data: [users.MANAGER, users.ADMIN].map((user) => ({
			type: 'WRITE_OFF',
			idRecipient: user.id,
			idStockMovement: automatic.id
		}))
	})
	const snapshot = () =>
		Promise.all(
			[
				'batch',
				'dish',
				'order',
				'orderRejection',
				'stockMovement',
				'message',
				'stopList',
				'settings'
			].map((model) => p[model].findMany({ orderBy: { id: 'asc' } }))
		)
	const before = await snapshot()
	const result = await call(
		'statistics/forecast?days=3&includeRejections=false'
	)
	const row = result.products.find((item) => item.id === product.id)
	assert.equal(result.observationHours, 168)
	assert.equal((await call('statistics/forecast?days=14')).days, 14)
	assert(Math.abs(Number(row.dailyDemand) - 24) < 0.01)
	assert(Math.abs(Number(row.toOrder) - 50.5) < 0.02)
	assert(Math.abs(Number(row.expectedLoss) - 8.5) < 0.02)
	assert.equal(
		result.products.find((item) => item.id === unknown.id).toOrder,
		null
	)
	const withRefusals = await call(
		'statistics/forecast?days=3&includeRejections=true'
	)
	assert(
		Math.abs(
			Number(
				withRefusals.products.find((item) => item.id === product.id).dailyDemand
			) - 30
		) < 0.01
	)
	const history = await call('statistics/expiry?from=2026-10-01&to=2026-10-01')
	assert.equal(history.movements, 3)
	assert.equal(history.batches, 2)
	assert.equal(history.units.length, 2)
	const kg = history.units.find((item) => item.id === unit.id),
		liters = history.units.find((item) => item.id === otherUnit.id)
	assert.equal(kg.products[0].auto, '1.250')
	assert.equal(kg.products[0].manualExpired, '0.500')
	assert.equal(liters.products[0].otherManual, '2.250')
	assert.equal(kg.series.length, 24)
	assert.equal(kg.series[0].auto, '1.250')
	assert.equal(kg.series[23].manualExpired, '0.500')
	const hot = await call('hot-preview')
	assert(hot.items.some((item) => item.isHot))
	assert.deepEqual(await snapshot(), before)
	if (process.env.STATISTICS_BROWSER) {
		const { chromium } = require(process.env.PLAYWRIGHT_MODULE)
		const browser = await chromium.launch({ headless: true, channel: 'msedge' })
		try {
			const page = await browser.newPage({
					viewport: { width: 1440, height: 1050 }
				}),
				errors = []
			page.on('pageerror', (error) => errors.push(error.message))
			await page.context().addCookies([
				{
					name: 'accessToken',
					value: tokens.MANAGER,
					domain: 'localhost',
					path: '/'
				},
				{
					name: 'refreshToken',
					value: jwt.sign({
						id: users.MANAGER.id,
						role: 'MANAGER',
						type: 'refresh'
					}),
					domain: 'localhost',
					path: '/'
				}
			])
			const api = `http://127.0.0.1:${app.getHttpServer().address().port}`
			await page.route(
				/http:\/\/localhost:(?:4200|3100)\/api\//,
				async (route) => {
					const headers = {
						'access-control-allow-origin': 'http://localhost:3100',
						'access-control-allow-credentials': 'true',
						'access-control-allow-headers': 'content-type,authorization',
						'access-control-allow-methods': 'GET,POST'
					}
					if (route.request().method() === 'OPTIONS')
						return route.fulfill({ status: 204, headers })
					const response = await route.fetch({
						url: route
							.request()
							.url()
							.replace(/^http:\/\/localhost:(?:4200|3100)(?=\/api\/)/, api)
					})
					await route.fulfill({
						response,
						headers: { ...response.headers(), ...headers }
					})
				}
			)
			await page.goto('http://localhost:3100/manager/statistics')
			await page
				.getByRole('button', { name: 'Что заказать', exact: true })
				.click()
			await page
				.getByRole('img', { name: /Рекомендуемая закупка, кг/ })
				.waitFor()
			await page.getByRole('rowheader', { name: /Общий ингредиент/ }).waitFor()
			assert.equal(
				await page
					.getByRole('button', { name: '14 дней', exact: true })
					.getAttribute('aria-pressed'),
				'true'
			)
			await page.screenshot({
				path: process.env.STATISTICS_SCREENSHOT,
				fullPage: true
			})
			await page.getByLabel('Учитывать неудовлетворённый спрос').check()
			await page.getByRole('button', { name: '7 дней', exact: true }).click()
			await page
				.getByRole('img', { name: /Рекомендуемая закупка, кг/ })
				.waitFor()
			await page
				.getByRole('cell', { name: 'Недостаточно данных', exact: true })
				.first()
				.waitFor()
			await page.getByRole('button', { name: 'Просрочка', exact: true }).click()
			await page.getByLabel('С даты', { exact: true }).fill('2026-10-01')
			await page.getByLabel('По дату включительно').fill('2026-10-01')
			await page.getByRole('button', { name: 'Показать', exact: true }).click()
			await page.getByRole('img', { name: /История списаний, кг/ }).waitFor()
			await page
				.getByRole('button', { name: 'По времени', exact: true })
				.first()
				.click()
			assert.equal(await page.locator('tbody tr').count(), 48)
			assert.equal(
				await page
					.getByRole('button', { name: 'Прогноз', exact: true })
					.count(),
				0
			)
			assert.equal(await page.getByLabel('Единица измерения').count(), 0)
			await page
				.getByRole('button', { name: 'Горячие предложения', exact: true })
				.click()
			await page.getByRole('img', { name: /Горячие предложения/ }).waitFor()
			for (const item of hot.items.filter((item) => item.isHot))
				await page
					.getByRole('heading', { name: item.name, exact: true })
					.waitFor()
			await page.setViewportSize({ width: 390, height: 844 })
			await page.evaluate(() =>
				document.documentElement.setAttribute('data-theme', 'dark')
			)
			assert(
				await page.evaluate(
					() => document.documentElement.scrollWidth <= innerWidth
				)
			)
			await page.screenshot({
				path: process.env.STATISTICS_SCREENSHOT.replace(
					'.png',
					'-hot-mobile.png'
				),
				fullPage: true
			})
			await page
				.getByRole('button', { name: 'Что заказать', exact: true })
				.click()
			await page
				.getByRole('img', { name: /Рекомендуемая закупка, кг/ })
				.waitFor()
			assert(
				await page.evaluate(
					() => document.documentElement.scrollWidth <= innerWidth
				)
			)
			assert.deepEqual(errors, [])
			console.log(
				'PASS browser: procurement, unknown demand, units, expiry history, hot list, mobile dark theme'
			)
		} finally {
			await browser.close()
		}
	}
	console.log(
		`PASS ${checks} API checks: roles, validation, shared demand, FEFO, unknown history, optional refusals, archived recipes, movement history, timezone boundaries, unit separation, no notification duplication, read-only snapshots`
	)
}
run()
	.catch((error) => {
		console.error(error)
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
