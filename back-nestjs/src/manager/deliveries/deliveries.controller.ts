import {
	Body,
	Controller,
	Get,
	Param,
	Post,
	Query,
	UsePipes,
	ValidationPipe
} from '@nestjs/common'
import { Role } from '@prisma/client'
import { Auth } from '../../auth/decorators/auth.decorator'
import { CurrentUser } from '../../auth/decorators/user.decorator'
import {
	DeliveriesQueryDto,
	DeliveryInputDto,
	SupplierInputDto
} from './deliveries.dto'
import { ManagerDeliveriesService } from './deliveries.service'

@Controller('manager')
@UsePipes(
	new ValidationPipe({
		transform: true,
		whitelist: true,
		forbidNonWhitelisted: true
	})
)
export class ManagerDeliveriesController {
	constructor(private readonly service: ManagerDeliveriesService) {}
	@Get('suppliers')
	@Auth(Role.MANAGER)
	suppliers() {
		return this.service.getSuppliers()
	}
	@Post('suppliers')
	@Auth(Role.MANAGER)
	createSupplier(@Body() dto: SupplierInputDto) {
		return this.service.createSupplier(dto)
	}
	@Get('deliveries')
	@Auth(Role.MANAGER)
	list(@Query() dto: DeliveriesQueryDto) {
		return this.service.list(dto)
	}
	@Get('deliveries/:id')
	@Auth(Role.MANAGER)
	get(@Param('id') id: string) {
		return this.service.get(id)
	}
	@Post('deliveries')
	@Auth(Role.MANAGER)
	receive(@CurrentUser('id') userId: string, @Body() dto: DeliveryInputDto) {
		return this.service.receive(userId, dto)
	}
}
