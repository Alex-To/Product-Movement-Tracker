import { Module } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { SettingsController } from './settings.controller'
import { SettingsService } from './settings.service'

// Настройки нужны складу, кухне и официанту — модуль экспортирует сервис
@Module({
	controllers: [SettingsController],
	providers: [SettingsService, PrismaService],
	exports: [SettingsService]
})
export class SettingsModule {}
