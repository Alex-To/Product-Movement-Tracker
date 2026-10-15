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
	page.on('pageerror', (e) => errors.push(e.message))
	await page.goto(origin + '/auth/login')
	await page.getByLabel('Логин', { exact: true }).fill('manager')
	await page
		.getByLabel('Пароль', { exact: true })
		.fill('production-test-password')
	await page.getByRole('button', { name: 'Войти', exact: true }).click()
	await page.waitForURL(/\/manager(?:\/.*)?$/)
	await page.getByRole('navigation', { name: 'Разделы менеджера' }).waitFor()
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
	assert.deepEqual(errors, [])
	console.log(
		'PASS production: clean/idempotent employee bootstrap, same-origin API, HTTP host-only cookies on non-localhost host, manager login, server-side refresh, logout'
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
