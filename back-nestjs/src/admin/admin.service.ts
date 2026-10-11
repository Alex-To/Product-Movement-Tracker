import { PrismaService } from '@/prisma.service'
import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException
} from '@nestjs/common'
import { Prisma, Role } from '@prisma/client'
import { hash } from 'argon2'
import { CreateUserDto } from './dto/create-user.dto'
import { UpdateUserDto } from './dto/update-user.dto'

const PUBLIC_USER_SELECT = {
	id: true,
	login: true,
	name: true,
	role: true
} satisfies Prisma.UserSelect

// Порядок в таблице сотрудников: админ, менеджеры, официанты, кухня
const ROLE_ORDER: Role[] = [Role.ADMIN, Role.MANAGER, Role.WAITER, Role.KITCHEN]

@Injectable()
export class AdminService {
	constructor(private prisma: PrismaService) {}

	async getUsers() {
		const users = await this.prisma.user.findMany({
			select: PUBLIC_USER_SELECT,
			orderBy: { name: 'asc' }
		})

		return users.sort(
			(a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role)
		)
	}

	async createUser(dto: CreateUserDto) {
		const login = dto.login.trim()
		await this.ensureLoginIsFree(login)

		return this.prisma.user.create({
			data: {
				login,
				name: dto.name.trim(),
				role: dto.role,
				password: await hash(dto.password)
			},
			select: PUBLIC_USER_SELECT
		})
	}

	async updateUser(id: string, dto: UpdateUserDto) {
		const user = await this.prisma.user.findUnique({ where: { id } })
		if (!user) throw new NotFoundException('Сотрудник не найден')

		const data: Prisma.UserUpdateInput = {}

		if (dto.name !== undefined) data.name = dto.name.trim()

		if (dto.login !== undefined) {
			const login = dto.login.trim()
			if (login !== user.login) await this.ensureLoginIsFree(login)
			data.login = login
		}

		if (dto.password) {
			if (dto.password.length < 6) {
				throw new BadRequestException('Пароль — не короче 6 символов')
			}
			data.password = await hash(dto.password)
		}

		if (dto.role !== undefined && dto.role !== user.role) {
			if (user.role === Role.ADMIN) {
				throw new ForbiddenException('Роль администратора менять нельзя')
			}
			data.role = dto.role
		}

		return this.prisma.user.update({
			where: { id },
			data,
			select: PUBLIC_USER_SELECT
		})
	}

	async deleteUser(id: string, currentUserId: string) {
		if (id === currentUserId) {
			throw new ForbiddenException('Себя удалить нельзя')
		}

		const user = await this.prisma.user.findUnique({ where: { id } })
		if (!user) throw new NotFoundException('Сотрудник не найден')

		if (user.role === Role.ADMIN) {
			throw new ForbiddenException('Администратора удалить нельзя')
		}

		try {
			await this.prisma.user.delete({ where: { id } })
		} catch (error) {
			// Поставки, заказы и движения ссылаются на сотрудника — история должна остаться
			if (
				error instanceof Prisma.PrismaClientKnownRequestError &&
				error.code === 'P2003'
			) {
				throw new ConflictException(
					'Нельзя удалить: за сотрудником числятся поставки, заказы или списания'
				)
			}
			throw error
		}

		return true
	}

	private async ensureLoginIsFree(login: string) {
		const existing = await this.prisma.user.findUnique({ where: { login } })
		if (existing) {
			throw new ConflictException('Сотрудник с таким логином уже есть')
		}
	}
}
