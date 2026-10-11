import { Auth } from '@/auth/decorators/auth.decorator'
import { CurrentUser } from '@/auth/decorators/user.decorator'
import {
	Body,
	Controller,
	Get,
	Post,
	UsePipes,
	ValidationPipe
} from '@nestjs/common'
import { Role } from '@prisma/client'
import { CreateOrderDto } from './dto/create-order.dto'
import { WaiterService } from './waiter.service'

@Controller('waiter')
export class WaiterController {
	constructor(private readonly waiterService: WaiterService) {}

	@Auth(Role.WAITER)
	@Get('menu')
	async getMenu() {
		return this.waiterService.getMenu()
	}

	@UsePipes(new ValidationPipe({ whitelist: true }))
	@Auth(Role.WAITER)
	@Post('orders')
	async createOrder(
		@CurrentUser('id') userId: string,
		@Body() dto: CreateOrderDto
	) {
		return this.waiterService.createOrder(userId, dto)
	}
}
