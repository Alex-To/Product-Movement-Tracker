import { Auth } from '@/auth/decorators/auth.decorator'
import { CurrentUser } from '@/auth/decorators/user.decorator'
import { Controller, Get, Header } from '@nestjs/common'
import { omit } from 'lodash'
import { UserService } from './user.service'

@Controller('users')
export class UserController {
	constructor(private readonly userService: UserService) {}

	@Auth()
	@Get('profile')
	@Header('Cache-Control', 'private, no-store')
	async getProfile(@CurrentUser('id') id: string) {
		const user = await this.userService.getById(id)
		return omit(user, ['password'])
	}
}
