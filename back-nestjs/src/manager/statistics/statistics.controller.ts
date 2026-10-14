import {
	Controller,
	Get,
	Query,
	UsePipes,
	ValidationPipe
} from '@nestjs/common'
import { Role } from '@prisma/client'
import { Auth } from '../../auth/decorators/auth.decorator'
import { StatisticsQueryDto } from './statistics.dto'
import { ManagerStatisticsService } from './statistics.service'

@Controller('manager/statistics')
@UsePipes(
	new ValidationPipe({
		transform: true,
		whitelist: true,
		forbidNonWhitelisted: true
	})
)
export class ManagerStatisticsController {
	constructor(private readonly service: ManagerStatisticsService) {}
	@Get('sales') @Auth(Role.MANAGER) sales(@Query() query: StatisticsQueryDto) {
		return this.service.sales(query)
	}
	@Get('rejections') @Auth(Role.MANAGER) rejections(
		@Query() query: StatisticsQueryDto
	) {
		return this.service.rejections(query)
	}
}
