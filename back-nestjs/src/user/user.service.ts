import { Injectable } from '@nestjs/common'
import type { User } from '@prisma/client'

import { PrismaService } from 'src/prisma.service'

@Injectable()
export class UserService {
	constructor(private prisma: PrismaService) {}

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

	async update(id: string, data: Partial<User>) {
		return this.prisma.user.update({
			where: {
				id
			},
			data
		})
	}
}
