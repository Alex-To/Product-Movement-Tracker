import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AdminModule } from './admin/admin.module'
import { AuthModule } from './auth/auth.module'
import { KitchenModule } from './kitchen/kitchen.module'
import { ManagerModule } from './manager/manager.module'
import { UserModule } from './user/user.module'

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true
		}),
		AuthModule,
		UserModule,
		KitchenModule,
		AdminModule,
		ManagerModule
	]
})
export class AppModule {}
