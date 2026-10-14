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
import { ForecastQueryDto } from './stock-statistics.dto'
import { StockStatisticsService } from './stock-statistics.service'

@Controller('manager/statistics')
@UsePipes(
	new ValidationPipe({
		transform: true,
		whitelist: true,
		forbidNonWhitelisted: true
	})
)
export class StockStatisticsController {
	constructor(private readonly service: StockStatisticsService) {}
	@Get('forecast') @Auth(Role.MANAGER) forecast(
		@Query() query: ForecastQueryDto
	) {
		return this.service.forecast(query)
	}
	@Get('expiry') @Auth(Role.MANAGER) expiry(
		@Query() query: StatisticsQueryDto
	) {
		return this.service.expiry(query)
	}
}
