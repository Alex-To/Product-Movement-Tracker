import { Module } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { ExternalApiKeyGuard } from './api-key.guard'
import {
	ExternalController,
	ManagerExternalController
} from './external.controller'
import { ExternalService } from './external.service'
import { KeyEncryptionService } from './key-encryption.service'

@Module({
	controllers: [ExternalController, ManagerExternalController],
	providers: [
		PrismaService,
		ExternalService,
		ExternalApiKeyGuard,
		KeyEncryptionService
	]
})
export class ExternalModule {}
