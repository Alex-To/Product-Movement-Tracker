import { Role } from '@prisma/client'
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator'
import { ASSIGNABLE_ROLES } from './create-user.dto'

export class UpdateUserDto {
	@IsOptional()
	@MinLength(1, { message: 'Укажите имя' })
	@IsString()
	name?: string

	@IsOptional()
	@MinLength(3, { message: 'Логин — не короче 3 символов' })
	@IsString()
	login?: string

	@IsOptional()
	@IsString()
	password?: string

	@IsOptional()
	@IsIn(ASSIGNABLE_ROLES, {
		message: 'Роль: менеджер, официант или кухня'
	})
	role?: Role
}
