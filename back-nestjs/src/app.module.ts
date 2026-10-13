import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AdminModule } from './admin/admin.module'
import { AuthModule } from './auth/auth.module'
import { InventoryModule } from './inventory/inventory.module'
import { KitchenModule } from './kitchen/kitchen.module'
import { ManagerModule } from './manager/manager.module'
import { SettingsModule } from './settings/settings.module'
import { UserModule } from './user/user.module'
import { WaiterModule } from './waiter/waiter.module'

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true
		}),
		AuthModule,
		UserModule,
		KitchenModule,
		AdminModule,
		InventoryModule,
		ManagerModule,
		SettingsModule,
		WaiterModule
	]
})
export class AppModule {}
