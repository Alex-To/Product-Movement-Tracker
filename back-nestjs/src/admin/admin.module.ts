import { PrismaService } from '@/prisma.service'
import { Module } from '@nestjs/common'
import { AdminController } from './admin.controller'
import { AdminService } from './admin.service'

@Module({
	controllers: [AdminController],
	providers: [AdminService, PrismaService]
})
export class AdminModule {}
