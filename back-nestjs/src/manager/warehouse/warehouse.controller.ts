import {
	Controller,
	Get,
	Param,
	Query,
	UsePipes,
	ValidationPipe
} from '@nestjs/common'
import { Role } from '@prisma/client'
import { Auth } from '../../auth/decorators/auth.decorator'
import { WarehousePageDto, WarehouseQueryDto } from './warehouse.dto'
import { ManagerWarehouseService } from './warehouse.service'
@Controller('manager/warehouse')
@UsePipes(
	new ValidationPipe({
		transform: true,
		whitelist: true,
		forbidNonWhitelisted: true
	})
)
export class ManagerWarehouseController {
	constructor(private readonly service: ManagerWarehouseService) {}
	@Get('products') @Auth(Role.MANAGER) products(
		@Query() dto: WarehouseQueryDto
	) {
		return this.service.products(dto)
	}
	@Get('signals') @Auth(Role.MANAGER) signals() {
		return this.service.signals()
	}
	@Get('products/:id/batches') @Auth(Role.MANAGER) batches(
		@Param('id') id: string,
		@Query() dto: WarehousePageDto
	) {
		return this.service.batches(id, dto)
	}
}
