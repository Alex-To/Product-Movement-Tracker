import { NestFactory } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'
import * as cookieParser from 'cookie-parser'
import { AppModule } from './app.module'
import { UPLOADS_DIR } from './manager/dishes/dish-image.storage'

async function bootstrap() {
	const app = await NestFactory.create<NestExpressApplication>(AppModule)

	app.setGlobalPrefix('api')

	// Фото блюд: /uploads/dishes/<файл>, вне префикса /api
	app.useStaticAssets(UPLOADS_DIR, { prefix: '/uploads/', maxAge: '30d' })

	app.use(cookieParser())
	app.enableCors({
		origin: ['http://localhost:3000'],
		credentials: true,
		exposedHeaders: 'set-cookie'
	})

	await app.listen(4200)
}
bootstrap()
