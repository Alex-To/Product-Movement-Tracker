import { HotOffersModule } from '../inventory/hot-offers.module'
import { PrismaService } from '@/prisma.service'
import { Module } from '@nestjs/common'
import { SettingsModule } from '../settings/settings.module'
import { HotPreviewController } from './hot-preview.controller'
import { WaiterController } from './waiter.controller'
import { WaiterService } from './waiter.service'

@Module({
	imports: [SettingsModule, HotOffersModule],
	controllers: [WaiterController, HotPreviewController],
	providers: [WaiterService, PrismaService]
})
export class WaiterModule {}
