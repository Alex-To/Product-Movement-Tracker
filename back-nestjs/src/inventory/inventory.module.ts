import { Module } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { SettingsModule } from '../settings/settings.module'
import { ExpiryWatcher } from './expiry-watcher.service'

@Module({
	imports: [SettingsModule],
	providers: [ExpiryWatcher, PrismaService]
})
export class InventoryModule {}
