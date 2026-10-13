import { NestFactory } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'
import * as cookieParser from 'cookie-parser'
import { AppModule } from './app.module'
import { UPLOADS_DIR } from './manager/dishes/dish-image.storage'

const SERVER_TIME_HEADER = 'X-Server-Time'

async function bootstrap() {
	const app = await NestFactory.create<NestExpressApplication>(AppModule)

	app.setGlobalPrefix('api')

	// Фото блюд: /uploads/dishes/<файл>, вне префикса /api
	app.useStaticAssets(UPLOADS_DIR, { prefix: '/uploads/', maxAge: '30d' })

	// Серверное время в каждом ответе: фронт по нему поправляет часы устройства,
	// чтобы сроки годности на всех экранах считались от одного «сейчас»
	app.use((_req: unknown, res: { setHeader(name: string, value: string): void }, next: () => void) => {
		res.setHeader(SERVER_TIME_HEADER, Date.now().toString())
		next()
	})

	app.use(cookieParser())
	app.enableCors({
		origin: ['http://localhost:3000'],
		credentials: true,
		exposedHeaders: ['set-cookie', SERVER_TIME_HEADER]
	})

	await app.listen(4200)
}
bootstrap()
