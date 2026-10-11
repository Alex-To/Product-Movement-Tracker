import { Auth } from '@/auth/decorators/auth.decorator'
import { CurrentUser } from '@/auth/decorators/user.decorator'
import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	Param,
	Patch,
	Post,
	UsePipes,
	ValidationPipe
} from '@nestjs/common'
import { Role } from '@prisma/client'
import { AdminService } from './admin.service'
import { CreateUserDto } from './dto/create-user.dto'
import { UpdateUserDto } from './dto/update-user.dto'

@Controller('admin')
export class AdminController {
	constructor(private readonly adminService: AdminService) {}

	@Auth(Role.ADMIN)
	@Get('users')
	async getUsers() {
		return this.adminService.getUsers()
	}

	@UsePipes(new ValidationPipe({ whitelist: true }))
	@Auth(Role.ADMIN)
	@Post('users')
	async createUser(@Body() dto: CreateUserDto) {
		return this.adminService.createUser(dto)
	}

	@UsePipes(new ValidationPipe({ whitelist: true }))
	@Auth(Role.ADMIN)
	@Patch('users/:id')
	async updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
		return this.adminService.updateUser(id, dto)
	}

	@HttpCode(200)
	@Auth(Role.ADMIN)
	@Delete('users/:id')
	async deleteUser(
		@Param('id') id: string,
		@CurrentUser('id') currentUserId: string
	) {
		return this.adminService.deleteUser(id, currentUserId)
	}
}
