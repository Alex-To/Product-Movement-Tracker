// Uses only a unique local schema; applies real migrations and removes its fixtures.
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
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
const db = new PrismaClient()
const frontendUrl = process.env.MANUAL_HOT_FRONTEND || 'http://localhost:3000'
let app
let checks = 0

async function run() {
	// Deploy the previous schema first to verify preservation of real existing rows.
	const previous = fs.mkdtempSync(path.join(os.tmpdir(), 'pmt-hot-migration-'))
	try {
		fs.copyFileSync('prisma/schema.prisma', path.join(previous, 'schema.prisma'))
		fs.cpSync('prisma/migrations', path.join(previous, 'migrations'), {
			recursive: true,
			filter: source => path.basename(source) !== '20261015160000_optional_manual_hot_deadline'
		})
		const before = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy', '--schema', path.join(previous, 'schema.prisma')], { env: process.env, encoding: 'utf8' })
		assert.equal(before.status, 0, before.stderr)
		// SQL fixtures intentionally target the pre-migration schema without the new flag.
		await db.$executeRaw`INSERT INTO "dishes" ("id_dish", "name", "manual_hot_until", "deleted_at") VALUES
			('migration-future', 'migration future', (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '1 day', NULL),
			('migration-expired', 'migration expired', (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '1 day', NULL),
			('migration-absent', 'migration absent', NULL, NULL),
			('migration-archived', 'migration archived', (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '1 day', (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))`
	} finally {
		fs.rmSync(previous, { recursive: true, force: true })
	}
	const setup = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], { env: process.env, encoding: 'utf8' })
	assert.equal(setup.status, 0, setup.stderr)
	const migrated = await db.dish.findMany({ orderBy: { id: 'asc' } })
	assert.deepEqual(migrated.map(dish => [dish.id, dish.manualHotEnabled]), [
		['migration-absent', false], ['migration-archived', false], ['migration-expired', false], ['migration-future', true]
	])
	assert(migrated.find(dish => dish.id === 'migration-future').manualHotUntil > new Date())
	await db.dish.deleteMany()
	console.log('PASS migration: future deadlines preserved; absent, expired and archived assignments disabled')
	app = await NestFactory.create(AppModule, { logger: ['error'] })
	app.setGlobalPrefix('api')
	app.use(require('cookie-parser')())
	app.enableCors({ origin: frontendUrl, credentials: true })
	await app.init()
	const jwt = app.get(JwtService), tokens = {}, users = {}
	for (const role of ['MANAGER', 'ADMIN', 'KITCHEN', 'WAITER']) {
		users[role] = await db.user.create({ data: { login: role, name: role, role, password: 'unused' } })
		tokens[role] = jwt.sign({ id: users[role].id, role, type: 'access' })
	}
	const call = async (method, route, body, status = 200, role = 'MANAGER') => {
		let req = request(app.getHttpServer())[method]('/api/' + route)
		if (role) req = req.set('Authorization', 'Bearer ' + tokens[role])
		if (body !== undefined) req = req.send(body)
		const res = await req
		assert.equal(res.status, status, `${method} ${route}: ${JSON.stringify(res.body)}`)
		checks++
		return res.body
	}
	const settings = { cookReserveMinutes: 30, urgentPercent: 100, urgentMinHours: 24, urgentMaxHours: 168, hotLimit: 1, demandDays: 7 }
	await call('put', 'manager/settings', settings)
	const unit = await db.unit.create({ data: { name: 'kg' } })
	const makeDish = async (name, urgent = true) => {
		const product = await db.product.create({ data: { nameProduct: name, idUnit: unit.id } })
		const delivery = await db.delivery.create({ data: { number: name, createrId: users.MANAGER.id, createDate: new Date(Date.now() - 48 * 3600000) } })
		const batch = await db.batch.create({ data: { idProduct: product.id, idDelivery: delivery.id, count: '10', EXP: new Date(Date.now() + (urgent ? 12 : 720) * 3600000) } })
		const dish = await db.dish.create({ data: { name, ingredients: { create: { idProduct: product.id, count: '1' } } } })
		return { dish, batch }
	}
	const a = await makeDish('A automatic'), b = await makeDish('B candidate'), manual = await makeDish('Manual fresh', false)
	const until = new Date(Date.now() + 4 * 3600000).toISOString()
	const endpoint = id => `manager/dishes/${id}/manual-hot`
	for (const role of [null, 'ADMIN', 'KITCHEN', 'WAITER']) {
		await call('put', endpoint(manual.dish.id), { expiresAt: until }, role ? 403 : 401, role)
		await call('delete', endpoint(manual.dish.id), undefined, role ? 403 : 401, role)
	}
	for (const body of [{ expiresAt: '' }, { expiresAt: 42 }, { expiresAt: '2026-02-30T12:00:00Z' }, { expiresAt: '2026-10-16T15:00:00' }, { expiresAt: '2000-01-01T00:00:00Z' }, { expiresAt: until, extra: 1 }])
		await call('put', endpoint(manual.dish.id), body, 400)
	await call('put', endpoint('missing'), { expiresAt: until }, 404)
	await call('put', endpoint(a.dish.id), { expiresAt: until }, 409)
	let indefinite = await call('put', endpoint(manual.dish.id), {})
	assert.equal(indefinite.manualHotActive, true)
	assert.equal(indefinite.manualHotUntil, null)
	assert.equal(indefinite.hotSource, 'MANUAL')
	await call('put', endpoint(manual.dish.id), { expiresAt: null })
	let indefinitePreview = await call('get', 'manager/hot-preview')
	assert.equal(indefinitePreview.manualCount, 1)
	assert.equal(indefinitePreview.items.filter(d => d.id === manual.dish.id).length, 1)
	assert.equal(indefinitePreview.items[0].manualHotUntil, null)
	await call('post', 'kitchen/stop-list/' + manual.dish.id, {}, 200, 'KITCHEN')
	indefinite = await call('get', 'manager/dishes/' + manual.dish.id)
	assert.equal(indefinite.manualHotActive, true)
	assert.equal(indefinite.isHot, false)
	await call('put', endpoint(manual.dish.id), {})
	await call('delete', 'kitchen/stop-list/' + manual.dish.id, undefined, 200, 'KITCHEN')
	assert.equal((await call('get', 'manager/dishes/' + manual.dish.id)).hotSource, 'MANUAL')
	await db.batch.update({ where: { id: manual.batch.id }, data: { count: '0' } })
	indefinite = await call('get', 'manager/dishes/' + manual.dish.id)
	assert.equal(indefinite.manualHotActive, true)
	assert.equal(indefinite.isHot, false)
	await db.batch.update({ where: { id: manual.batch.id }, data: { count: '10' } })
	assert.equal((await call('get', 'manager/dishes/' + manual.dish.id)).hotSource, 'MANUAL')

	const initial = await call('put', endpoint(manual.dish.id), { expiresAt: until })
	assert.equal(initial.hotSource, 'MANUAL')
	assert.equal(initial.version, 1)
	assert.equal(initial.manualHotUntil, until)
	assert.equal(initial.manualHotActive, true)
	assert.equal((await call('put', endpoint(manual.dish.id), {})).manualHotUntil, null)
	await call('put', endpoint(manual.dish.id), { expiresAt: until })
	let menu = await call('get', 'waiter/menu', undefined, 200, 'WAITER')
	assert.equal(menu[0].id, manual.dish.id)
	assert.equal(menu.filter(d => d.isHot).length, 2)
	assert.equal(menu.find(d => d.id === a.dish.id).hotSource, 'AUTO')
	let catalog = await call('get', 'manager/dishes?search=Manual')
	assert.equal(catalog.items[0].hotSource, 'MANUAL')
	assert.equal((await call('get', 'manager/dishes/' + a.dish.id)).hotSource, 'AUTO')
	await call('put', endpoint(b.dish.id), { expiresAt: new Date(Date.now() + 2 * 3600000).toISOString() })
	let preview = await call('get', 'manager/hot-preview')
	assert.equal(preview.manualCount, 2)
	assert.equal(preview.items[0].id, b.dish.id)
	assert.equal(preview.items.filter(d => d.isHot).length, 3)
	preview = await call('get', 'manager/hot-preview?hotLimit=0')
	assert.equal(preview.items.filter(d => d.isHot).length, 2)
	await call('post', 'kitchen/stop-list/' + manual.dish.id, {}, 200, 'KITCHEN')
	let suspended = await call('get', 'manager/dishes/' + manual.dish.id)
	assert.equal(suspended.isHot, false)
	assert.equal(suspended.manualHotUntil, until)
	await call('put', endpoint(manual.dish.id), { expiresAt: until })
	await call('delete', 'kitchen/stop-list/' + manual.dish.id, undefined, 200, 'KITCHEN')
	assert.equal((await call('get', 'manager/dishes/' + manual.dish.id)).hotSource, 'MANUAL')
	await db.batch.update({ where: { id: manual.batch.id }, data: { count: '0' } })
	suspended = await call('get', 'manager/dishes/' + manual.dish.id)
	assert.equal(suspended.isHot, false)
	assert.equal(suspended.manualHotUntil, until)
	await db.batch.update({ where: { id: manual.batch.id }, data: { count: '10' } })
	assert.equal((await call('get', 'manager/dishes/' + manual.dish.id)).hotSource, 'MANUAL')
	await db.dish.update({ where: { id: manual.dish.id }, data: { manualHotUntil: new Date(Date.now() - 1) } })
	assert.equal((await call('get', 'manager/dishes/' + manual.dish.id)).manualHotUntil, null)
	await call('delete', endpoint(manual.dish.id))
	await call('delete', endpoint(manual.dish.id))
	await call('put', endpoint(manual.dish.id), {})
	const archived = await call('patch', `manager/dishes/${manual.dish.id}/trash`, { version: 1 })
	assert.equal((await db.dish.findUnique({ where: { id: manual.dish.id } })).manualHotUntil, null)
	await call('put', endpoint(manual.dish.id), { expiresAt: until }, 404)
	await call('patch', `manager/dishes/${manual.dish.id}/restore`, { version: archived.dish.version })
	assert.equal((await call('get', 'manager/dishes/' + manual.dish.id)).manualHotActive, false)
	assert.equal((await db.dish.findUnique({ where: { id: manual.dish.id } })).manualHotEnabled, false)
	await call('put', 'manager/settings', { ...settings, hotLimit: 0 })
	await call('put', endpoint(a.dish.id), { expiresAt: until })
	await call('delete', endpoint(b.dish.id))
	await call('put', 'manager/settings', settings)
	menu = await call('get', 'waiter/menu', undefined, 200, 'WAITER')
	assert.equal(menu.find(d => d.id === a.dish.id).hotSource, 'MANUAL')
	assert.equal(menu.find(d => d.id === b.dish.id).hotSource, 'AUTO')
	await Promise.all([1, 2].map(hours => call('put', endpoint(a.dish.id), { expiresAt: new Date(Date.now() + hours * 3600000).toISOString() })))
	assert.equal((await db.dish.findUnique({ where: { id: a.dish.id } })).version, 1)
	assert.equal(await db.stockMovement.count(), 0, 'Promotions must not change stock')
	if (process.env.MANUAL_HOT_BROWSER) {
		await app.listen(4200, '0.0.0.0')
		const { chromium } = require(process.env.PLAYWRIGHT_MODULE)
		const browser = await chromium.launch({ channel: 'chrome', headless: true })
		try {
			const context = await browser.newContext()
			await context.addCookies([
				{ name: 'accessToken', value: tokens.MANAGER, domain: 'localhost', path: '/', sameSite: 'Strict' },
				{ name: 'refreshToken', value: jwt.sign({ id: users.MANAGER.id, role: 'MANAGER', type: 'refresh' }), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }
			])
			const page = await context.newPage()
			await page.goto(frontendUrl + '/manager/dishes/' + manual.dish.id)
			await page.locator('#dish-name').waitFor()
			await page.locator('#dish-name').fill('Unsaved recipe draft')
			const inputValue = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 16) // +4h in restaurant UTC+3
			await page.getByRole('button', { name: 'Добавить в горячие: Manual fresh', exact: true }).last().click()
			let dialog = page.getByRole('dialog')
			assert.equal(await dialog.getByRole('radio', { name: 'Без срока', exact: true }).isChecked(), true)
			assert.equal(await dialog.locator('input[type="datetime-local"]').count(), 0)
			await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click()
			await dialog.waitFor({ state: 'hidden' })
			const indefiniteSaved = await call('get', 'manager/dishes/' + manual.dish.id)
			assert.equal(indefiniteSaved.manualHotActive, true)
			assert.equal(indefiniteSaved.manualHotUntil, null)
			assert.equal(await page.locator('#dish-name').inputValue(), 'Unsaved recipe draft')
			await page.getByRole('button', { name: 'Изменить срок горячего предложения: Manual fresh', exact: true }).last().click()
			dialog = page.getByRole('dialog')
			assert.equal(await dialog.getByRole('radio', { name: 'Без срока', exact: true }).isChecked(), true)
			await dialog.getByRole('radio', { name: 'До даты и времени', exact: true }).check()
			await dialog.locator('input[type="datetime-local"]').fill(inputValue)
			await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click()
			await dialog.waitFor({ state: 'hidden' })
			await page.getByRole('button', { name: 'Изменить срок горячего предложения: Manual fresh', exact: true }).last().waitFor()
			assert.equal(await page.locator('#dish-name').inputValue(), 'Unsaved recipe draft')
			assert.equal((await call('get', 'manager/dishes/' + manual.dish.id)).hotSource, 'MANUAL')
			await page.getByRole('button', { name: 'Изменить срок горячего предложения: Manual fresh', exact: true }).last().click()
			dialog = page.getByRole('dialog')
			assert.equal(await dialog.locator('input[type="datetime-local"]').inputValue(), inputValue)
			await dialog.locator('input[type="datetime-local"]').fill(new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 16))
			await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click()
			await dialog.waitFor({ state: 'hidden' })
			await page.getByRole('button', { name: 'Изменить срок горячего предложения: Manual fresh', exact: true }).last().click()
			dialog = page.getByRole('dialog')
			await dialog.getByRole('radio', { name: 'Без срока', exact: true }).check()
			await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click()
			await dialog.waitFor({ state: 'hidden' })
			assert.equal((await call('get', 'manager/dishes/' + manual.dish.id)).manualHotUntil, null)
			await page.setViewportSize({ width: 390, height: 844 })
			if (process.env.MANUAL_HOT_SCREENSHOT) await page.screenshot({ path: process.env.MANUAL_HOT_SCREENSHOT, fullPage: true })
			const removed = page.waitForResponse(res => res.url().endsWith('/manual-hot') && res.request().method() === 'DELETE')
			await page.getByRole('button', { name: 'Снять ручное', exact: true }).last().click()
			assert.equal((await removed).status(), 200)
			await page.getByRole('button', { name: 'Добавить в горячие: Manual fresh', exact: true }).last().waitFor()
			assert.equal(await page.locator('#dish-name').inputValue(), 'Unsaved recipe draft')
			assert.equal((await db.dish.findUnique({ where: { id: manual.dish.id } })).name, 'Manual fresh')
			assert.equal(await page.getByRole('button', { name: 'Добавить в горячие: B candidate', exact: true }).isDisabled(), true)
			await context.close()
			console.log('PASS browser: assign/edit/remove, restaurant time, automatic button disabled, mobile layout, recipe draft preserved')
		} finally { await browser.close() }
	}
	console.log(`PASS ${checks} manual-hot API checks: roles, validation, quota, ordering, preview, suspension, expiry, archive, concurrent updates and stock invariants`)
}

run().catch(e => { console.error(e); process.exitCode = 1 }).finally(async () => {
	if (app) {
		const clients = app.get(PrismaService, { each: true })
		await app.close()
		await Promise.all(clients.map(client => client.$disconnect()))
	}
	try {
		assert(/^manager_test_[a-f0-9]{32}$/.test(schema))
		await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
	} finally { await db.$disconnect() }
})
