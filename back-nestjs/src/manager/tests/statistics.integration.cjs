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
const prisma = new PrismaClient()
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
	const users = {},
		tokens = {},
		jwt = app.get(JwtService)
	for (const role of ['MANAGER', 'ADMIN', 'WAITER', 'KITCHEN']) {
		users[role] = await prisma.user.create({
			data: { login: role, name: role, role, password: 'unused' }
		})
		tokens[role] = jwt.sign(
			{ id: users[role].id, role, type: 'access' },
			{ expiresIn: '10m' }
		)
	}
	let checks = 0
	const call = async (
		section,
		params = 'from=2026-10-01&to=2026-10-01',
		status = 200,
		role = 'MANAGER'
	) => {
		let req = request(app.getHttpServer()).get(
			`/api/manager/statistics/${section}?${params}`
		)
		if (role) req = req.set('Authorization', `Bearer ${tokens[role]}`)
		const response = await req
		assert.equal(response.status, status, JSON.stringify(response.body))
		checks++
		return response.body
	}
	for (const section of ['sales', 'rejections']) {
		for (const role of [null, 'ADMIN', 'WAITER', 'KITCHEN'])
			await call(section, undefined, role ? 403 : 401, role)
		for (const params of [
			'from=2026-02-30&to=2026-03-01',
			'from=2026-10-02&to=2026-10-01',
			'from=2025-01-01&to=2026-10-01',
			'from=2026-10-01',
			'from=2026-10-01&to=2026-10-01&extra=true'
		])
			await call(section, params, 400)
	}
	assert.equal((await call('sales')).summary.portions, 0)
	const a = await prisma.dish.create({ data: { name: 'Одинаковое название' } })
	const b = await prisma.dish.create({
		data: { name: a.name, deletedAt: new Date() }
	})
	const order = async (date, lines) =>
		prisma.order.create({
			data: {
				number: 1,
				createDate: new Date(date),
				createrId: users.WAITER.id,
				items: { create: lines.map(([idDish, count]) => ({ idDish, count })) }
			}
		})
	await order('2026-09-30T20:59:59.999Z', [[a.id, 100]])
	await order('2026-09-30T21:00:00.000Z', [
		[a.id, 2],
		[a.id, 3],
		[b.id, 4]
	])
	await order('2026-10-01T20:59:59.999Z', [[a.id, 1]])
	await order('2026-10-01T21:00:00.000Z', [[a.id, 100]])
	const line = (dish, count, blocked) => ({
		dishId: dish.id,
		dishName: dish.name,
		excluded: [],
		count,
		...(blocked === undefined ? {} : { blocked })
	})
	const rejection = async (reason, lines) =>
		prisma.orderRejection.create({
			data: {
				reason,
				lines,
				details:
					reason === 'SHORTAGE'
						? {
								shortages: [
									{
										productName: 'Числовое количество',
										unit: 'кг',
										need: 1.2,
										available: 0.1
									},
									{
										productName: 'Строковое количество',
										unit: 'кг',
										need: '12.340',
										available: '0.000'
									}
								]
							}
						: {},
				waiterName: 'Официант',
				createDate: new Date('2026-09-30T21:00:00Z')
			}
		})
	await rejection('STOP_LIST', [line(a, 3, true), line(b, 99, false)])
	await rejection('STOP_LIST', [line(a, 3, true)])
	await rejection('SHORTAGE', [line(b, 10, true), line(a, 88, false)])
	await rejection('SHORTAGE', [line(a, 77)])
	await rejection('BUSY', [line(a, 90, true)])
	const snapshot = async () =>
		Promise.all(
			[
				'order',
				'orderItem',
				'orderRejection',
				'dish',
				'stockMovement',
				'batch'
			].map((name) => prisma[name].findMany({ orderBy: { id: 'asc' } }))
		)
	const before = await snapshot()
	const sales = await call('sales')
	assert.deepEqual(sales.summary, { portions: 10, orders: 2, dishes: 2 })
	assert.equal(sales.dishes.find((d) => d.dishId === a.id).orders, 2)
	assert.equal(sales.dishes.find((d) => d.dishId === b.id).archived, true)
	assert.equal(sales.series.length, 24)
	assert.equal(sales.series[0].portions, 9)
	assert.equal(sales.series[23].portions, 1)
	const refused = await call('rejections')
	assert.deepEqual(refused.summary, {
		attempts: 5,
		portions: 16,
		incompleteAttempts: 1,
		byReason: { STOP_LIST: 2, SHORTAGE: 2, BUSY: 1 }
	})
	assert.equal(refused.dishes.find((d) => d.dishId === a.id).portions, 6)
	assert.equal(refused.dishes.find((d) => d.dishId === a.id).attempts, 2)
	assert.equal(refused.series[0].attempts, 5)
	assert.equal(refused.series[0].portions, 16)
	assert.equal(
		(await call('sales', 'from=2024-02-28&to=2024-03-01')).series.length,
		3
	)
	assert.equal(
		(await call('sales', 'from=2026-09-30&to=2026-10-02')).series.length,
		3
	)
	assert.deepEqual(await snapshot(), before)
	if (process.env.STATISTICS_BROWSER) {
		const { chromium } = require(process.env.PLAYWRIGHT_MODULE)
		const browser = await chromium.launch({ headless: true, channel: 'msedge' })
		try {
			const page = await browser.newPage({
					viewport: { width: 1440, height: 1000 }
				}),
				errors = []
			page.on('pageerror', (error) => errors.push(error.message))
			await page.context().addCookies([
				{
					name: 'refreshToken',
					value: jwt.sign(
						{ id: users.MANAGER.id, role: 'MANAGER', type: 'refresh' },
						{ expiresIn: '10m' }
					),
					domain: 'localhost',
					path: '/'
				},
				{
					name: 'accessToken',
					value: tokens.MANAGER,
					domain: 'localhost',
					path: '/'
				}
			])
			const api = `http://127.0.0.1:${app.getHttpServer().address().port}`
			await page.route('http://localhost:4200/api/**', async (route) => {
				const headers = {
					'access-control-allow-origin': 'http://localhost:3100',
					'access-control-allow-credentials': 'true',
					'access-control-allow-headers': 'content-type,authorization',
					'access-control-allow-methods': 'GET,POST'
				}
				if (route.request().method() === 'OPTIONS')
					return route.fulfill({ status: 204, headers })
				const response = await route.fetch({
					url: route.request().url().replace('http://localhost:4200', api)
				})
				await route.fulfill({
					response,
					headers: { ...response.headers(), ...headers }
				})
			})
			await page.goto('http://localhost:3100/manager/statistics')
			await page.getByLabel('С даты', { exact: true }).fill('2026-10-01')
			await page.getByLabel('По дату включительно').fill('2026-10-01')
			await page.getByRole('button', { name: 'Показать', exact: true }).click()
			await page
				.getByRole('rowheader', { name: 'Одинаковое название', exact: true })
				.waitFor()
			await page.getByRole('img', { name: /Продажи блюд/ }).waitFor()
			await page.getByRole('button', { name: 'Отказы', exact: true }).click()
			await page.getByRole('img', { name: /Отказы в продаже/ }).waitFor()
			await page
				.getByRole('button', { name: 'По времени', exact: true })
				.click()
			await page
				.getByRole('heading', { name: 'Попытки отказа по времени' })
				.waitFor()
			assert.equal(await page.locator('tbody tr').count(), 24)
			await page.screenshot({
				path: process.env.STATISTICS_SCREENSHOT,
				fullPage: true
			})
			await page.setViewportSize({ width: 390, height: 844 })
			await page.evaluate(() =>
				document.documentElement.setAttribute('data-theme', 'dark')
			)
			assert(
				await page.evaluate(
					() => document.documentElement.scrollWidth <= innerWidth
				),
				'Mobile overflow'
			)
			await page.getByRole('button', { name: 'По блюдам', exact: true }).click()
			await page.getByRole('img', { name: /Отказы в продаже/ }).waitFor()
			await page.screenshot({
				path: process.env.STATISTICS_SCREENSHOT.replace('.png', '-mobile.png'),
				fullPage: true
			})
			await page.goto('http://localhost:3100/manager/warehouse')
			await page
				.getByText('Числовое количество: нужно 1,2 кг, было годного 0,1 кг', {
					exact: true
				})
				.first()
				.waitFor()
			await page
				.getByText(
					'Строковое количество: нужно 12,340 кг, было годного 0,000 кг',
					{ exact: true }
				)
				.first()
				.waitFor()
			assert.deepEqual(errors, [])
			console.log(
				'PASS warehouse rejection log: JSON numbers and decimal strings render without errors'
			)
			console.log(
				'PASS browser: real API, charts, tabs, hourly table, mobile dark theme, no overflow/errors'
			)
		} finally {
			await browser.close()
		}
	}
	console.log(
		`PASS ${checks} API checks: roles, validation, timezone boundaries, duplicate names, archived dishes, distinct orders, rejected lines, old records, leap day, read-only snapshots`
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
			await prisma.$executeRawUnsafe(
				`DROP SCHEMA IF EXISTS "${schema}" CASCADE`
			)
		} finally {
			await prisma.$disconnect()
		}
	})
