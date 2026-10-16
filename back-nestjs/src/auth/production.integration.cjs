// Production frontend + same-origin HTTP proxy + real API in an isolated local schema.
// Run from back-nestjs after the frontend production build.
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { spawn, spawnSync } = require('node:child_process')
const http = require('node:http')
const path = require('node:path')
require('dotenv').config()
const url = new URL(process.env.DATABASE_URL)
assert(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
const schema = 'manager_test_' + randomUUID().replaceAll('-', '')
url.searchParams.set('schema', schema)
process.env.DATABASE_URL = url.toString()
process.env.COOKIE_SECURE = 'false'
process.env.NODE_ENV = 'production'
require('ts-node/register/transpile-only')
require('tsconfig-paths/register')
require('reflect-metadata')
const { PrismaClient } = require('@prisma/client')
const { NestFactory } = require('@nestjs/core')
const { PrismaService } = require('../prisma.service')
const { AppModule } = require('../app.module')
const { JwtService } = require('@nestjs/jwt')
const db = new PrismaClient()
let app, frontend, gateway, browser
const frontendDir = path.resolve('../front-next-js-auth-4')
async function run() {
	const setup = spawnSync(
		process.execPath,
		[require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
		{ encoding: 'utf8', env: process.env }
	)
	assert.equal(setup.status, 0, setup.stderr)
	const bootstrapEnv = { ...process.env }
	for (const role of ['ADMIN', 'MANAGER', 'WAITER', 'KITCHEN'])
		bootstrapEnv[`PMT_INITIAL_${role}_PASSWORD`] = 'production-test-password'
	const bootstrap = () =>
		spawnSync(process.execPath, ['scripts/bootstrap-users.cjs'], {
			encoding: 'utf8',
			env: bootstrapEnv
		})
	assert.equal(bootstrap().status, 0)
	const first = await db.user.findMany({ orderBy: { login: 'asc' } })
	assert.equal(first.length, 4)
	assert.equal(await db.product.count(), 0)
	assert.equal(await db.dish.count(), 0)
	assert.equal(bootstrap().status, 0)
	assert.deepEqual(
		(await db.user.findMany({ orderBy: { login: 'asc' } })).map(
			(u) => u.password
		),
		first.map((u) => u.password)
	)
	app = await NestFactory.create(AppModule, { logger: ['error'] })
	app.setGlobalPrefix('api')
	app.use(require('cookie-parser')())
	await app.listen(0, '127.0.0.1')
	const backendPort = app.getHttpServer().address().port
	frontend = spawn(
		process.execPath,
		[
			path.join(frontendDir, 'node_modules/next/dist/bin/next'),
			'start',
			'-H',
			'127.0.0.1',
			'-p',
			'3110'
		],
		{
			cwd: frontendDir,
			env: {
				...process.env,
				API_INTERNAL_URL: `http://127.0.0.1:${backendPort}/api`,
				NEXT_PUBLIC_BACKEND_URL: '',
				NEXT_TELEMETRY_DISABLED: '1'
			},
			stdio: ['ignore', 'pipe', 'pipe']
		}
	)
	let output = ''
	frontend.stdout.on('data', (b) => (output += b))
	frontend.stderr.on('data', (b) => (output += b))
	for (let i = 0; i < 100; i++) {
		if (frontend.exitCode !== null) throw Error('Frontend exited: ' + output)
		try {
			await fetch('http://127.0.0.1:3110/auth/login')
			break
		} catch {
			if (i === 99) throw Error('Frontend did not start: ' + output)
			await new Promise((r) => setTimeout(r, 100))
		}
	}
	gateway = http.createServer((req, res) => {
		const port =
			req.url.startsWith('/api/') || req.url.startsWith('/uploads/')
				? backendPort
				: 3110
		const upstream = http.request(
			{
				hostname: '127.0.0.1',
				port,
				path: req.url,
				method: req.method,
				headers: { ...req.headers, 'x-forwarded-proto': 'http' }
			},
			(response) => {
				res.writeHead(response.statusCode, response.headers)
				response.pipe(res)
			}
		)
		upstream.on('error', () => {
			res.statusCode = 502
			res.end('upstream unavailable')
		})
		req.pipe(upstream)
	})
	await new Promise((r) => gateway.listen(0, '127.0.0.1', r))
	const origin = 'http://127.0.0.1:' + gateway.address().port
	const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
	browser = await chromium.launch({ headless: true, channel: 'msedge' })
	const page = await browser.newPage(),
		errors = []
	let refreshRequests = 0
	page.on('request', (request) => {
		if (new URL(request.url()).pathname === '/api/auth/access-token')
			refreshRequests++
	})
	page.on('pageerror', (e) => errors.push(e.message))
	await page.goto(origin + '/auth/login')
	await page.getByLabel('Логин', { exact: true }).fill('manager')
	await page
		.getByLabel('Пароль', { exact: true })
		.fill('production-test-password')
	await page.getByRole('button', { name: 'Войти', exact: true }).click()
	await page.waitForURL(/\/manager(?:\/.*)?$/)
	await page.getByRole('navigation', { name: 'Разделы менеджера' }).waitFor()
	await page.getByText('manager · Менеджер', { exact: true }).waitFor()
	assert.equal(refreshRequests, 0, 'A valid session must not refresh on profile mount')
	let cookies = await page.context().cookies()
	assert(
		cookies.some(
			(c) => c.name === 'accessToken' && c.domain === '127.0.0.1' && !c.secure
		)
	)
	assert(
		cookies.some(
			(c) =>
				c.name === 'refreshToken' &&
				c.domain === '127.0.0.1' &&
				c.httpOnly &&
				!c.secure
		)
	)
	const profile = await page.request.get(origin + '/api/users/profile', {
		headers: {
			Authorization:
				'Bearer ' + cookies.find((c) => c.name === 'accessToken').value
		}
	})
	assert.equal(profile.status(), 200)
	assert.match(profile.headers()['cache-control'], /no-store/)
	await page.route('**/api/auth/access-token', async (route) => {
		await new Promise((resolve) => setTimeout(resolve, 150))
		await route.continue()
	})
	let rejectedProfiles = 0
	await page.route('**/api/users/profile', async (route) => {
		if (rejectedProfiles++ < 2)
			await route.fulfill({ status: 401, json: { message: 'Unauthorized' } })
		else await route.continue()
	})
	await page.reload()
	await page.getByText('manager · Менеджер', { exact: true }).waitFor()
	await page.getByRole('heading', { name: 'Склад и сроки годности', exact: true }).waitFor()
	assert.equal(refreshRequests, 1, 'Concurrent 401 responses must share one refresh')
	await page.unroute('**/api/users/profile')
	await page.unroute('**/api/auth/access-token')
	const manager = first.find((u) => u.role === 'MANAGER')
	const expired = app
		.get(JwtService)
		.sign(
			{ id: manager.id, role: 'MANAGER', type: 'access' },
			{ expiresIn: -1 }
		)
	await page
		.context()
		.addCookies([
			{ name: 'accessToken', value: expired, domain: '127.0.0.1', path: '/' }
		])
	await page.goto(origin + '/manager/external-interfaces')
	await page
		.getByRole('heading', { name: 'Внешние интерфейсы', exact: true })
		.waitFor()
	cookies = await page.context().cookies()
	assert.notEqual(cookies.find((c) => c.name === 'accessToken').value, expired)
	await page.getByRole('button', { name: 'Выйти', exact: true }).click()
	await page.waitForURL(/\/auth\/login/)
	cookies = await page.context().cookies()
	assert(
		!cookies.some((c) => c.name === 'accessToken' || c.name === 'refreshToken')
	)
	for (const [login, role, home, label] of [
		['waiter', 'WAITER', '/waiter', 'Официант'],
		['kitchen', 'KITCHEN', '/kitchen', 'Кухня'],
		['admin', 'ADMIN', '/admin', 'Администратор'],
		['manager', 'MANAGER', '/manager/warehouse', 'Менеджер']
	]) {
		await page.getByLabel('Логин', { exact: true }).fill(login)
		await page.getByLabel('Пароль', { exact: true }).fill('production-test-password')
		await page.getByRole('button', { name: 'Войти', exact: true }).click()
		await page.waitForURL(origin + home)
		await page.getByText(`${login} · ${label}`, { exact: true }).waitFor()
		cookies = await page.context().cookies()
		const authorization = 'Bearer ' + cookies.find((c) => c.name === 'accessToken').value
		const current = await page.request.get(origin + '/api/users/profile', {
			headers: { Authorization: authorization }
		})
		assert.equal((await current.json()).role, role)
		const managerOnly = await page.request.get(origin + '/api/manager/units', {
			headers: { Authorization: authorization }
		})
		assert.equal(managerOnly.status(), role === 'MANAGER' ? 200 : 403)
		const redirect = await page.request.get(origin + '/auth/login', { maxRedirects: 0 })
		assert.equal(new URL(redirect.headers().location).pathname, home)
		assert.match(redirect.headers()['cache-control'], /no-store/)
		if (role === 'MANAGER') {
			// A different browser/device must have an independent employee session.
			const peer = await browser.newContext()
			try {
				const peerPage = await peer.newPage()
				await peerPage.goto(origin + '/auth/login')
				await peerPage.getByLabel('Логин', { exact: true }).fill('waiter')
				await peerPage.getByLabel('Пароль', { exact: true }).fill('production-test-password')
				await peerPage.getByRole('button', { name: 'Войти', exact: true }).click()
				await peerPage.waitForURL(origin + '/waiter')
				await peerPage.getByText('waiter · Официант', { exact: true }).waitFor()
				await page.reload()
				await page.getByText('manager · Менеджер', { exact: true }).waitFor()
				await page.getByRole('heading', { name: 'Склад и сроки годности', exact: true }).waitFor()
				await peerPage.getByRole('button', { name: 'Выйти', exact: true }).click()
				await peerPage.waitForURL(origin + '/auth/login')
				const stillManager = await page.request.get(origin + '/auth/login', { maxRedirects: 0 })
				assert.equal(new URL(stillManager.headers().location).pathname, home)
			} finally {
				await peer.close()
			}
		}
		await page.getByRole('button', { name: 'Выйти', exact: true }).click()
		await page.waitForURL(origin + '/auth/login')
		assert(!(await page.context().cookies()).some((c) =>
			c.name === 'accessToken' || c.name === 'refreshToken'))
	}
	const anonymous = await browser.newContext()
	const denied = await anonymous.request.get(origin + '/manager/warehouse', { maxRedirects: 0 })
	assert.equal(new URL(denied.headers().location).pathname, '/auth/login')
	assert.match(denied.headers()['cache-control'], /no-store/)
	await anonymous.close()
	assert.deepEqual(errors, [])
	console.log(
		'PASS production: clean bootstrap, cookies, no unsolicited refresh, single refresh for concurrent 401, server refresh, four-role switching, independent browsers, manager-only API, logout, uncached redirects/profile'
	)
}
run()
	.catch((e) => {
		console.error(e)
		process.exitCode = 1
	})
	.finally(async () => {
		if (browser) await browser.close()
		if (gateway) {
			gateway.closeAllConnections()
			await new Promise((r) => gateway.close(r))
		}
		if (frontend && frontend.exitCode === null) {
			frontend.kill()
			await new Promise((r) => frontend.once('exit', r))
		}
		if (app) {
			const clients = app.get(PrismaService, { each: true })
			await app.close()
			await Promise.all(clients.map((p) => p.$disconnect()))
		}
		try {
			assert(/^manager_test_[a-f0-9]{32}$/.test(schema))
			await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
		} finally {
			await db.$disconnect()
		}
	})
