import { Injectable } from '@nestjs/common'
import type { Role, User } from '@prisma/client'
import { hash } from 'argon2'

import { PrismaService } from 'src/prisma.service'

@Injectable()
export class UserService {
	constructor(private prisma: PrismaService) {}

	async getUsers() {
		return this.prisma.user.findMany({
			select: {
				id: true,
				login: true,
				name: true,
				role: true
			}
		})
	}

	async getById(id: string) {
		return this.prisma.user.findUnique({
			where: {
				id
			}
		})
	}

	async getByLogin(login: string) {
		return this.prisma.user.findUnique({
			where: {
				login
			}
		})
	}

	async create(data: {
		login: string
		name: string
		password: string
		role: Role
	}) {
		return this.prisma.user.create({
			data: {
				...data,
				password: await hash(data.password)
			}
		})
	}

	async update(id: string, data: Partial<User>) {
		return this.prisma.user.update({
			where: {
				id
			},
			data
		})
	}
}
