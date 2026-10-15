// Run from back-nestjs: node src/manager/tests/dishes.browser.cjs
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
	const manager = await prisma.user.create({
		data: {
			login: 'dish-manager',
			name: 'Менеджер',
			role: 'MANAGER',
			password: await require('argon2').hash('dish-test-password')
		}
	})
	const unit = await prisma.unit.create({ data: { name: 'кг' } }),
		product = await prisma.product.create({
			data: { nameProduct: 'Помидоры', idUnit: unit.id }
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
				viewport: { width: 1440, height: 1000 }
			}),
			errors = []
		page.on('pageerror', (e) => errors.push(e.message))
		await page.route(
			/http:\/\/localhost:(?:4200|3100)\/api\//,
			async (route) => {
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
					url: route
						.request()
						.url()
						.replace(/^http:\/\/localhost:(?:4200|3100)(?=\/api\/)/, api)
				})
				await route.fulfill({
					response,
					headers: {
						...response.headers(),
						'access-control-allow-origin': 'http://localhost:3100',
						'access-control-allow-credentials': 'true'
					}
				})
			}
		)
		await page.goto('http://localhost:3100/auth/login')
		await page.getByPlaceholder('Введите логин').fill('dish-manager')
		await page.getByPlaceholder('Введите пароль').fill('dish-test-password')
		await page.getByRole('button', { name: 'Войти', exact: true }).click()
		await page.waitForURL('**/manager')
		await page.goto('http://localhost:3100')
		await page
			.getByRole('link', { name: 'Менеджер · Блюда и рецептуры', exact: true })
			.click()
		await page.getByRole('link', { name: 'Новое блюдо', exact: true }).click()
		await page.getByLabel('Название блюда', { exact: true }).fill('Салат')
		await page
			.getByRole('button', { name: 'Сохранить рецепт', exact: true })
			.click()
		await page
			.getByRole('alert')
			.filter({ hasText: 'Добавьте хотя бы один' })
			.waitFor()
		assert.equal(await prisma.dish.count(), 0)
		await page
			.getByRole('button', { name: '+ Помидоры · кг', exact: true })
			.click()
		await page.getByLabel('Количество на порцию', { exact: true }).fill('0,125')
		await page
			.getByRole('button', { name: '+ Помидоры · кг', exact: true })
			.click()
		await page
			.getByText(
				'Этот продукт уже есть. Вы можете просто увеличить количество.',
				{ exact: true }
			)
			.waitFor()
		assert.equal(
			await page.getByLabel('Количество на порцию', { exact: true }).count(),
			1
		)
		assert.equal(
			await page.evaluate(() => document.activeElement.id),
			'ingredient-' + product.id
		)
		page.once('dialog', (dialog) => dialog.dismiss())
		await page
			.getByRole('link', { name: 'На главную', exact: true })
			.first()
			.click()
		assert(page.url().endsWith('/new'))
		assert.equal(await prisma.dish.count(), 0)
		if (process.env.QA_OUTPUT_DIR)
			await page.screenshot({
				path: path.join(process.env.QA_OUTPUT_DIR, 'manager-dish-editor.png'),
				fullPage: true
			})
		await page.setViewportSize({ width: 390, height: 844 })
		assert(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth
			),
			'Editor mobile overflow'
		)
		if (process.env.QA_OUTPUT_DIR)
			await page.screenshot({
				path: path.join(process.env.QA_OUTPUT_DIR, 'manager-dish-mobile.png'),
				fullPage: true
			})
		await page
			.getByRole('button', { name: 'Сохранить рецепт', exact: true })
			.click()
		await page.waitForURL('**/manager/dishes')
		await page.getByText('Доступно порций: 0', { exact: true }).waitFor()
		await page.setViewportSize({ width: 1440, height: 1000 })
		const left = await page
			.getByRole('complementary', { name: 'Список блюд' })
			.boundingBox()
		const right = await page
			.getByRole('region', { name: 'Панель рецепта' })
			.boundingBox()
		assert(
			left.x + left.width <= right.x,
			'List stays to the left of the recipe'
		)
		const dish = await prisma.dish.findFirst()
		assert.equal(dish.version, 1)
		assert.equal(await prisma.dishIngredient.count(), 1)
		await page.getByRole('link', { name: 'Новое блюдо', exact: true }).click()
		await page.getByLabel('Название блюда', { exact: true }).fill('Салат')
		await page
			.getByText(
				'Блюдо с таким названием уже есть. Можно сохранить ещё одно.',
				{ exact: true }
			)
			.waitFor()
		page.once('dialog', (dialog) => dialog.accept())
		await page
			.getByRole('link', { name: 'Открыть рецепт: Салат', exact: true })
			.click()
		await page
			.getByRole('link', { name: 'Открыть рецепт: Салат', exact: true })
			.click()
		await page
			.getByLabel('Название блюда', { exact: true })
			.fill('Изменения пользователя')
		await page
			.getByRole('heading', { name: 'Открыть рецепт', exact: true })
			.waitFor()
		assert(
			await page.getByRole('complementary', { name: 'Список блюд' }).isVisible()
		)
		if (process.env.QA_OUTPUT_DIR)
			await page.screenshot({
				path: path.join(
					process.env.QA_OUTPUT_DIR,
					'manager-dishes-two-panels.png'
				),
				fullPage: true
			})
		await prisma.dish.update({
			where: { id: dish.id },
			data: { name: 'Изменено коллегой', version: { increment: 1 } }
		})
		await page
			.getByRole('button', { name: 'Сохранить рецепт', exact: true })
			.click()
		await page
			.getByRole('alert')
			.filter({ hasText: 'Блюдо уже изменено' })
			.waitFor()
		assert.equal(
			await page.getByLabel('Название блюда', { exact: true }).inputValue(),
			'Изменения пользователя'
		)
		page.once('dialog', (dialog) => dialog.accept())
		await page
			.getByRole('button', { name: 'Загрузить актуальную версию', exact: true })
			.click()
		await page.waitForFunction(
			() => document.querySelector('#dish-name').value === 'Изменено коллегой'
		)
		await page
			.getByLabel('Название блюда', { exact: true })
			.fill('Салат готовый')
		await page
			.getByRole('button', { name: 'Сохранить рецепт', exact: true })
			.click()
		await page.waitForURL('**/manager/dishes')
		await page
			.getByRole('button', { name: 'В корзину: Салат готовый', exact: true })
			.click()
		if (process.env.QA_OUTPUT_DIR)
			await page.screenshot({
				path: path.join(
					process.env.QA_OUTPUT_DIR,
					'manager-dishes-trash-dialog.png'
				),
				fullPage: true
			})
		await page
			.getByRole('dialog')
			.getByRole('button', { name: 'Нет', exact: true })
			.click()
		assert.equal(
			(await prisma.dish.findUnique({ where: { id: dish.id } })).deletedAt,
			null
		)
		await page
			.getByRole('button', { name: 'В корзину: Салат готовый', exact: true })
			.click()
		await page
			.getByRole('dialog')
			.getByRole('button', { name: 'Да', exact: true })
			.click()
		await page
			.getByText('Блюда не найдены. Создайте первое блюдо.', { exact: true })
			.waitFor()
		await page.getByRole('button', { name: 'Корзина', exact: true }).click()
		await page
			.getByRole('link', { name: 'Открыть рецепт: Салат готовый', exact: true })
			.waitFor()
		assert((await prisma.dish.findUnique({ where: { id: dish.id } })).deletedAt)
		await page
			.getByRole('button', { name: 'Восстановить: Салат готовый', exact: true })
			.click()
		await page
			.getByRole('dialog')
			.getByRole('button', { name: 'Да', exact: true })
			.click()
		await page.getByText('Корзина пуста', { exact: true }).waitFor()
		await page.getByRole('button', { name: 'Блюда', exact: true }).click()
		await page
			.getByRole('heading', { name: 'Салат готовый', exact: true })
			.waitFor()
		assert.equal(
			(await prisma.dish.findUnique({ where: { id: dish.id } })).version,
			5
		)
		assert.equal(await prisma.batch.count(), 0)
		assert.equal(await prisma.stockMovement.count(), 0)
		assert.deepEqual(errors, [])
		console.log(
			'PASS: real browser/API login, create without stock, empty recipe validation, duplicate ingredient focus, unsaved navigation, duplicate name, stale edit conflict/reload, save, trash/restore and mobile layout.'
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
