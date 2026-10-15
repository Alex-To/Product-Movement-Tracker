// Creates initial employees only; does not seed products, recipes or stock.
const { PrismaClient } = require('@prisma/client')
const { hash } = require('argon2')
const prisma = new PrismaClient()
const employees = [
	['ADMIN', 'admin', 'Администратор'],
	['MANAGER', 'manager', 'Менеджер'],
	['WAITER', 'waiter', 'Официант'],
	['KITCHEN', 'kitchen', 'Кухня']
]
async function main() {
	const prepared = []
	for (const [role, login, name] of employees) {
		const password = process.env[`PMT_INITIAL_${role}_PASSWORD`]
		if (!password) continue
		if (password.length < 12)
			throw Error(`PMT_INITIAL_${role}_PASSWORD: минимум 12 символов`)
		prepared.push({ role, login, name, password: await hash(password) })
	}
	if (!prepared.some((user) => user.role === 'ADMIN'))
		throw Error(
			'Укажите PMT_INITIAL_ADMIN_PASSWORD; пароли остальных ролей необязательны'
		)
	await prisma.$transaction(async (tx) => {
		for (const data of prepared) {
			const existing = await tx.user.findUnique({
				where: { login: data.login }
			})
			if (existing && existing.role !== data.role)
				throw Error(`Логин ${data.login} уже используется другой ролью`)
			if (!existing) await tx.user.create({ data })
		}
	})
	console.log(
		'Начальные сотрудники созданы. Существующие пароли и данные сохранены. Тестовое меню не загружалось.'
	)
}
main()
	.catch((error) => {
		console.error(error.message)
		process.exitCode = 1
	})
	.finally(() => prisma.$disconnect())
