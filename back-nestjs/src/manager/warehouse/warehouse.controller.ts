import {
	Body,
	Controller,
	Get,
	HttpCode,
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
	ReadMessagesDto,
	WarehousePageDto,
	WarehouseQueryDto
} from './warehouse.dto'
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
	@Get('signals') @Auth(Role.MANAGER) signals(
		@CurrentUser('id') userId: string
	) {
		return this.service.signals(userId)
	}
	@Get('products/:id/batches') @Auth(Role.MANAGER) batches(
		@Param('id') id: string,
		@Query() dto: WarehousePageDto
	) {
		return this.service.batches(id, dto)
	}
	@Post('batches/:id/write-off') @HttpCode(200) @Auth(Role.MANAGER) writeOff(
		@CurrentUser('id') userId: string,
		@Param('id') id: string
	) {
		return this.service.writeOffBatch(userId, id)
	}
	@Post('messages/read') @HttpCode(200) @Auth(Role.MANAGER) readMessages(
		@CurrentUser('id') userId: string,
		@Body() dto: ReadMessagesDto
	) {
		return this.service.readMessages(userId, dto.ids)
	}
}
