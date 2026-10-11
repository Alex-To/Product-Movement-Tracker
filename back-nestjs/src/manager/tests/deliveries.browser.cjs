// Run from back-nestjs: node src/manager/tests/deliveries.browser.cjs
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
	const password = await require('argon2').hash('receipt-test-password')
	await prisma.user.create({
		data: {
			login: 'receipt-manager',
			name: 'Тестовый менеджер',
			password,
			role: 'MANAGER'
		}
	})
	const unit = await prisma.unit.create({ data: { name: 'кг' } })
	await prisma.product.create({
		data: { nameProduct: 'Помидоры', idUnit: unit.id }
	})
	app = await NestFactory.create(AppModule, { logger: ['error'] })
	app.setGlobalPrefix('api')
	app.use(require('cookie-parser')())
	await app.listen(0, '127.0.0.1')
	const api = 'http://127.0.0.1:' + app.getHttpServer().address().port
	const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
	const browser = await chromium.launch({ channel: 'msedge', headless: true })
	try {
		const page = await browser.newPage({
				viewport: { width: 1440, height: 1050 }
			}),
			errors = []
		page.on('pageerror', (e) => errors.push(e.message))
		let dropFirstReceipt = true
		await page.route('http://localhost:4200/api/**', async (route) => {
			if (route.request().method() === 'OPTIONS')
				return route.fulfill({
					status: 204,
					headers: {
						'access-control-allow-origin': 'http://localhost:3100',
						'access-control-allow-credentials': 'true',
						'access-control-allow-headers': 'content-type,authorization',
						'access-control-allow-methods': 'GET,POST,PATCH,DELETE'
					}
				})
			const response = await route.fetch({
				url: route.request().url().replace('http://localhost:4200', api)
			})
			if (
				dropFirstReceipt &&
				route.request().method() === 'POST' &&
				route.request().url().endsWith('/manager/deliveries')
			) {
				dropFirstReceipt = false
				await route.abort('failed')
				return
			}
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
		await page.getByPlaceholder('Введите логин').fill('receipt-manager')
		await page.getByPlaceholder('Введите пароль').fill('receipt-test-password')
		await page.getByRole('button', { name: 'Войти', exact: true }).click()
		await page.waitForURL('**/manager')
		await page.goto('http://localhost:3100')
		await page
			.getByRole('link', { name: 'Менеджер · Поставки', exact: true })
			.click()
		await page
			.getByRole('heading', { name: 'Новая поставка', exact: true })
			.waitFor()
		await page
			.locator('summary')
			.filter({ hasText: 'Добавить поставщика' })
			.click()
		await page
			.getByLabel('Название поставщика', { exact: true })
			.fill('Ферма Юг')
		await page
			.getByRole('button', { name: 'Добавить поставщика', exact: true })
			.click()
		await page.waitForFunction(
			() => document.querySelector('#receipt-supplier').value.length > 0
		)
		await page.getByLabel('Номер накладной', { exact: true }).fill('Н-001')
		await page
			.getByRole('button', { name: '+ Помидоры · кг', exact: true })
			.click()
		await page
			.getByRole('button', { name: '+ Помидоры · кг', exact: true })
			.click()
		await page
			.getByLabel('Количество · строка 1', { exact: true })
			.fill('1,125')
		await page
			.getByLabel('Количество · строка 2', { exact: true })
			.fill('2.250')
		const expiry = (days) => {
			const d = new Date(Date.now() + days * 86400000)
			d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
			return d.toISOString().slice(0, 16)
		}
		const manualReceiptDate = expiry(-2)
		await page.getByLabel('Дата и время приёма (необязательно)', { exact: true }).fill(manualReceiptDate)
		assert(await page.getByRole('link', { name: 'Нет продукта в системе? Добавить продукт ↗' }).getAttribute('target') === '_blank')
		await page.getByText('Единица: кг', { exact: true }).first().waitFor()
		await page
			.getByLabel('Годен до · строка 1', { exact: true })
			.fill(expiry(-1))
		await page
			.getByLabel('Годен до · строка 2', { exact: true })
			.fill(expiry(40))
		await page
			.getByRole('button', { name: 'Проверить поставку', exact: true })
			.click()
		await page
			.getByRole('alert')
			.filter({ hasText: 'укажите будущие' })
			.waitFor()
		assert.equal(await prisma.delivery.count(), 0)
		await page
			.getByLabel('Годен до · строка 1', { exact: true })
			.fill(expiry(30))
		await page
			.getByRole('button', { name: 'Проверить поставку', exact: true })
			.click()
		await page
			.getByRole('heading', { name: 'Подтвердить приём?', exact: true })
			.waitFor()
		if (process.env.QA_OUTPUT_DIR)
			await page.screenshot({
				path: path.join(
					process.env.QA_OUTPUT_DIR,
					'manager-delivery-review.png'
				),
				fullPage: true
			})
		await page
			.getByRole('button', { name: 'Подтвердить приём', exact: true })
			.click()
		await page
			.getByRole('button', { name: 'Повторить подтверждение', exact: true })
			.click()
		await page.waitForURL(/\/manager\/deliveries\/[^/]+$/)
		await page
			.getByRole('heading', { name: 'Накладная № Н-001', exact: true })
			.waitFor()
		assert.equal(await prisma.delivery.count(), 1)
		assert.equal((await prisma.delivery.findFirst()).createDate.toISOString(), new Date(manualReceiptDate).toISOString())
		assert.equal(await prisma.batch.count(), 2)
		assert.equal(
			(
				await prisma.batch.aggregate({ _sum: { count: true } })
			)._sum.count.toFixed(3),
			'3.375'
		)
		if (process.env.QA_OUTPUT_DIR)
			await page.screenshot({
				path: path.join(
					process.env.QA_OUTPUT_DIR,
					'manager-delivery-receipt.png'
				),
				fullPage: true
			})
		await page.setViewportSize({ width: 390, height: 844 })
		assert(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth
			),
			'Receipt mobile overflow'
		)
		await page.getByRole('link', { name: '← Поставки', exact: true }).click()
		await page
			.getByRole('heading', { name: 'Новая поставка', exact: true })
			.waitFor()
		await page
			.getByRole('button', { name: '+ Помидоры · кг', exact: true })
			.click()
		assert(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth
			),
			'Form mobile overflow'
		)
		if (process.env.QA_OUTPUT_DIR)
			await page.screenshot({
				path: path.join(
					process.env.QA_OUTPUT_DIR,
					'manager-delivery-mobile.png'
				),
				fullPage: true
			})
		await page
			.getByLabel('Поиск по накладной или поставщику', { exact: true })
			.fill('Н-001')
		await page.getByRole('button', { name: 'Найти', exact: true }).click()
		await page
			.getByRole('link')
			.filter({ hasText: '№ Н-001 · Ферма Юг' })
			.waitFor()
		assert.deepEqual(errors, [])
		console.log(
			'PASS: real API/browser login, home navigation, supplier creation, two batches, expired-date rejection, review, atomic receipt, detail/history, desktop and mobile without overflow.'
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
