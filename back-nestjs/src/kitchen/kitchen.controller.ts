import { Auth } from '@/auth/decorators/auth.decorator'
import { CurrentUser } from '@/auth/decorators/user.decorator'
import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	Param,
	Post,
	UsePipes,
	ValidationPipe
} from '@nestjs/common'
import { Role } from '@prisma/client'
import { WriteOffDto } from './dto/write-off.dto'
import { KitchenService } from './kitchen.service'

@Controller('kitchen')
export class KitchenController {
	constructor(private readonly kitchenService: KitchenService) {}

	@Auth(Role.KITCHEN)
	@Get('orders')
	async getOrders() {
		return this.kitchenService.getOrders()
	}

	@Auth(Role.KITCHEN)
	@Get('products')
	async getProducts() {
		return this.kitchenService.getProducts()
	}

	@Auth(Role.KITCHEN)
	@Get('write-offs')
	async getMyWriteOffs(@CurrentUser('id') userId: string) {
		return this.kitchenService.getMyWriteOffs(userId)
	}

	@UsePipes(new ValidationPipe())
	@HttpCode(200)
	@Auth(Role.KITCHEN)
	@Post('write-offs')
	async writeOff(
		@CurrentUser('id') userId: string,
		@Body() dto: WriteOffDto
	) {
		return this.kitchenService.writeOff(userId, dto)
	}

	@Auth(Role.KITCHEN)
	@Get('stop-list')
	async getStopList() {
		return this.kitchenService.getStopList()
	}

	@HttpCode(200)
	@Auth(Role.KITCHEN)
	@Post('stop-list/:dishId')
	async setManualStop(
		@Param('dishId') dishId: string,
		@CurrentUser('id') userId: string
	) {
		return this.kitchenService.setManualStop(dishId, userId)
	}

	@HttpCode(200)
	@Auth(Role.KITCHEN)
	@Delete('stop-list/:dishId')
	async removeManualStop(@Param('dishId') dishId: string) {
		return this.kitchenService.removeManualStop(dishId)
	}
}
