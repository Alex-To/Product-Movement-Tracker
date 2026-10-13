import { Controller, Get, Query, UsePipes, ValidationPipe } from '@nestjs/common'
import { Role } from '@prisma/client'
import { Auth } from '../../auth/decorators/auth.decorator'
import { WarehousePageDto } from '../warehouse/warehouse.dto'
import { ManagerRejectionsService } from './rejections.service'

// Журнал отказов видит только менеджер — официанту и кухне причины не показываются
@Controller('manager/rejections')
@UsePipes(
	new ValidationPipe({
		transform: true,
		whitelist: true,
		forbidNonWhitelisted: true
	})
)
export class ManagerRejectionsController {
	constructor(private readonly service: ManagerRejectionsService) {}

	@Get()
	@Auth(Role.MANAGER)
	list(@Query() dto: WarehousePageDto) {
		return this.service.list(dto.page)
	}
}
