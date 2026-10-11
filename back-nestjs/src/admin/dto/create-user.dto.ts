import { Role } from '@prisma/client'
import { IsIn, IsString, MinLength } from 'class-validator'

export const ASSIGNABLE_ROLES = [Role.MANAGER, Role.WAITER, Role.KITCHEN]

export class CreateUserDto {
	@MinLength(1, { message: 'Укажите имя' })
	@IsString()
	name: string

	@MinLength(3, { message: 'Логин — не короче 3 символов' })
	@IsString()
	login: string

	@MinLength(6, { message: 'Пароль — не короче 6 символов' })
	@IsString()
	password: string

	@IsIn(ASSIGNABLE_ROLES, {
		message: 'Роль: менеджер, официант или кухня'
	})
	role: Role
}
