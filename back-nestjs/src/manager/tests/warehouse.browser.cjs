// Run from back-nestjs: node src/manager/tests/warehouse.browser.cjs
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
	const fs = require('node:fs'),
		setup = spawnSync(
			process.execPath,
			[require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
			{ env: process.env, encoding: 'utf8' }
		)
	assert.equal(setup.status, 0, setup.stderr)
	const manager = await prisma.user.create({
		data: {
			login: 'warehouse-manager',
			name: 'Менеджер',
			role: 'MANAGER',
			password: await require('argon2').hash('warehouse-test-password')
		}
	})
	const sql = fs.readFileSync('prisma/demo-manager-25.sql', 'utf8')
	await prisma.$executeRawUnsafe(
		sql.match(/DO \$demo25\$[\s\S]*?\$demo25\$;/)[0]
	)
	const product = await prisma.product.findUnique({
		where: { id: 'demo25_product_01' }
	})
	await prisma.product.create({
		data: {
			nameProduct: '[ТЕСТ25] Ягода для второй страницы',
			idUnit: product.idUnit
		}
	})
	await prisma.batch.create({
		data: {
			id: 'browser-soon',
			idProduct: product.id,
			idDelivery: 'demo25_delivery_01',
			count: '0.125',
			EXP: new Date(Date.now() + 3600000)
		}
	})
	await prisma.batch.create({
		data: {
			id: 'browser-expired',
			idProduct: product.id,
			idDelivery: 'demo25_delivery_01',
			count: '0.500',
			EXP: new Date(Date.now() - 3600000)
		}
	})
	app = await NestFactory.create(AppModule, { logger: ['error'] })
	app.setGlobalPrefix('api')
	app.use(require('cookie-parser')())
	await app.listen(0, '127.0.0.1')
	const api = 'http://127.0.0.1:' + app.getHttpServer().address().port
	const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'),
		browser = await chromium.launch({ headless: true, channel: 'msedge' })
	try {
		const page = await browser.newPage({
				viewport: { width: 1440, height: 1100 }
			}),
			errors = []
		page.on('pageerror', (e) => errors.push(e.message))
		await page.route('http://localhost:4200/api/**', async (route) => {
			if (route.request().method() === 'OPTIONS')
				return route.fulfill({
					status: 204,
					headers: {
						'access-control-allow-origin': 'http://localhost:3100',
						'access-control-allow-credentials': 'true',
						'access-control-allow-headers': 'content-type,authorization',
						'access-control-allow-methods': 'GET,POST'
					}
				})
			const response = await route.fetch({
				url: route.request().url().replace('http://localhost:4200', api)
			})
			await route.fulfill({
				response,
				headers: {
					...response.headers(),
					'access-control-allow-origin': 'http://localhost:3100',
					'access-control-allow-credentials': 'true'
				}
			})
		})
		await page.goto('http://localhost:3100/auth/login')
		await page.getByPlaceholder('Введите логин').fill('warehouse-manager')
		await page
			.getByPlaceholder('Введите пароль')
			.fill('warehouse-test-password')
		await page.getByRole('button', { name: 'Войти', exact: true }).click()
		await page.waitForURL('**/manager')
		await page.goto('http://localhost:3100')
		await page
			.getByRole('link', { name: 'Менеджер · Склад', exact: true })
			.click()
		await page
			.getByRole('heading', { name: 'Склад и сроки годности', exact: true })
			.waitFor()
		await page
			.getByRole('region', { name: 'Истекают в ближайшие 24 часа' })
			.getByText('[ТЕСТ25] Помидоры', { exact: true })
			.waitFor()
		await page
			.getByRole('region', { name: 'Блюда в стоп-листе' })
			.getByText(/MANUAL/)
			.first()
			.waitFor()
		await page.getByRole('button', { name: 'Следующая', exact: true }).click()
		await page
			.getByText('Страница 2 · Всего продуктов: 26', { exact: true })
			.waitFor()
		await page.getByRole('button', { name: 'Предыдущая', exact: true }).click()
		await page.getByLabel('Поиск продукта', { exact: true }).fill('Помидоры')
		await page.getByRole('button', { name: 'Найти', exact: true }).click()
		await page
			.getByText('Страница 1 · Всего продуктов: 2', { exact: true })
			.waitFor()
		await page
			.getByRole('button', {
				name: 'Партии продукта: [ТЕСТ25] Помидоры',
				exact: true
			})
			.first()
			.click()
		const batches = page.getByRole('region', {
			name: 'Партии: [ТЕСТ25] Помидоры'
		})
		await batches
			.getByText('Просроченные — не участвуют в FEFO', { exact: true })
			.waitFor()
		await batches.getByText('1-я', { exact: true }).waitFor()
		await batches.getByText('Не участвует', { exact: true }).waitFor()
		assert.equal(
			await batches.getByRole('link').first().getAttribute('href'),
			'/manager/deliveries/demo25_delivery_01'
		)
		if (process.env.QA_OUTPUT_DIR)
			await page.screenshot({
				path: path.join(
					process.env.QA_OUTPUT_DIR,
					'manager-warehouse-desktop.png'
				),
				fullPage: true
			})
		await page.setViewportSize({ width: 390, height: 844 })
		assert(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth
			),
			'Warehouse mobile overflow'
		)
		if (process.env.QA_OUTPUT_DIR)
			await page.screenshot({
				path: path.join(
					process.env.QA_OUTPUT_DIR,
					'manager-warehouse-mobile.png'
				),
				fullPage: true
			})
		await page
			.getByLabel('Только с истекающими партиями', { exact: true })
			.check()
		await page
			.getByText('Страница 1 · Всего продуктов: 1', { exact: true })
			.waitFor()
		await prisma.batch.updateMany({
			where: { idProduct: product.id },
			data: { EXP: new Date(Date.now() - 1000) }
		})
		await page
			.getByText('Продукты не найдены.', { exact: true })
			.waitFor({ timeout: 22000 })
		assert.equal(await prisma.stockMovement.count(), 0)
		assert.equal(await prisma.dish.count(), 30)
		assert.deepEqual(errors, [])
		console.log(
			'PASS: real API/browser warehouse navigation, three signals, pagination/search, expanded FEFO + expired parties, delivery links, mobile overflow and 15-second automatic refresh after expiry.'
		)
	} finally {
		await browser.close()
	}
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
