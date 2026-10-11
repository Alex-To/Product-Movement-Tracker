import { PrismaClient, Role } from '@prisma/client'
import { hash } from 'argon2'

const prisma = new PrismaClient()

const employees = [
	{ login: 'admin', name: 'Администратор', role: Role.ADMIN },
	{ login: 'manager', name: 'Менеджер', role: Role.MANAGER },
	{ login: 'waiter', name: 'Официант', role: Role.WAITER },
	{ login: 'kitchen', name: 'Кухня', role: Role.KITCHEN }
]

async function main() {
	const password = await hash('123456')

	for (const employee of employees) {
		await prisma.user.upsert({
			where: { login: employee.login },
			update: {},
			create: { ...employee, password }
		})
	}
}

main()
	.catch(e => {
		console.error(e)
		process.exit(1)
	})
	.finally(() => prisma.$disconnect())
