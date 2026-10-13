import { ConflictException } from '@nestjs/common'
import { Prisma, StopType } from '@prisma/client'
import { PrismaService } from '../prisma.service'
import { type ExpiryPolicy, usableAfter } from './expiry'
import { loadExpiryPolicy } from './policy'

type Db = Prisma.TransactionClient | PrismaService

export type Ingredient = { idProduct: string; count: Prisma.Decimal }

// Открытая запись стоп-листа: блюдо сейчас в стопе. Снятая — только история
export const OPEN_STOP = { closedAt: null } satisfies Prisma.StopListWhereInput

/**
 * Годный остаток продуктов: сумма партий, из которых ещё успеют приготовить, —
 * их срок позже, чем «сейчас + запас на готовку». Остальные партии в порции,
 * авто-стоп и списание по заказу не идут
 */
export async function availableStock(
	db: Db,
	now = new Date(),
	productIds?: string[],
	policy?: ExpiryPolicy
) {
	const from = usableAfter(now, policy ?? (await loadExpiryPolicy(db)))
	const rows = await db.batch.groupBy({
		by: ['idProduct'],
		where: {
			...(productIds ? { idProduct: { in: productIds } } : {}),
			EXP: { gt: from },
			count: { gt: 0 }
		},
		_sum: { count: true }
	})
	return new Map(
		rows.map((row) => [row.idProduct, row._sum.count ?? new Prisma.Decimal(0)])
	)
}

export function countPortions(
	ingredients: Ingredient[],
	stock: Map<string, Prisma.Decimal>
) {
	if (!ingredients.length || ingredients.some((item) => item.count.lte(0)))
		return 0
	return Math.min(
		...ingredients.map((item) =>
			(stock.get(item.idProduct) ?? new Prisma.Decimal(0))
				.div(item.count)
				.floor()
				.toNumber()
		)
	)
}

/**
 * Авто-стоп = «N = 0». Открывает запись, когда порций не осталось, и закрывает
 * (не удаляет), когда они появились. Вызывается после любого движения склада
 * и таймером сроков — в момент, когда партия перестаёт годиться для готовки
 */
export async function refreshAutoStops(
	tx: Prisma.TransactionClient,
	where: Prisma.DishWhereInput,
	now = new Date(),
	policy?: ExpiryPolicy
) {
	const dishes = await tx.dish.findMany({
		where: { AND: [where, { deletedAt: null }] },
		select: {
			id: true,
			ingredients: { select: { idProduct: true, count: true } }
		}
	})
	if (!dishes.length) return { opened: 0, closed: 0 }

	const ids = [
		...new Set(
			dishes.flatMap((dish) => dish.ingredients.map((item) => item.idProduct))
		)
	]
	const stock = await availableStock(tx, now, ids, policy)
	const open = await tx.stopList.findMany({
		where: {
			idDish: { in: dishes.map((dish) => dish.id) },
			type: StopType.AUTO,
			...OPEN_STOP
		},
		select: { idDish: true }
	})
	const stopped = new Set(open.map((row) => row.idDish))

	const toOpen: string[] = []
	const toClose: string[] = []
	for (const dish of dishes) {
		const empty = countPortions(dish.ingredients, stock) === 0
		if (empty && !stopped.has(dish.id)) toOpen.push(dish.id)
		if (!empty && stopped.has(dish.id)) toClose.push(dish.id)
	}

	if (toOpen.length)
		await tx.stopList.createMany({
			data: toOpen.map((idDish) => ({
				idDish,
				type: StopType.AUTO,
				createdAt: now
			}))
		})
	if (toClose.length)
		await tx.stopList.updateMany({
			where: { idDish: { in: toClose }, type: StopType.AUTO, ...OPEN_STOP },
			data: { closedAt: now }
		})
	return { opened: toOpen.length, closed: toClose.length }
}

export const BUSY_MESSAGE =
	'Склад был занят другими операциями — ничего не списано, повторите'

const INVENTORY_ATTEMPTS = 3

// Конфликт параллельных транзакций: Postgres откатил одну из них, её можно повторить
export function isSerializationFailure(error: unknown) {
	return (
		error instanceof Prisma.PrismaClientKnownRequestError &&
		(error.code === 'P2034' ||
			(error.code === 'P2010' &&
				['40001', '40P01'].includes(String(error.meta?.code))))
	)
}

/**
 * Любое движение склада — одна транзакция Serializable: весь заказ или ничего.
 * Конфликт с параллельной операцией повторяется; если склад занят все три попытки,
 * клиент получает понятный отказ 409, а не ошибку сервера
 */
export async function inventoryTransaction<T>(
	db: PrismaService,
	work: (tx: Prisma.TransactionClient) => Promise<T>,
	onBusy: () => Error = () => new ConflictException(BUSY_MESSAGE)
): Promise<T> {
	for (let attempt = 1; ; attempt++) {
		try {
			return await db.$transaction(work, { isolationLevel: 'Serializable' })
		} catch (error) {
			if (!isSerializationFailure(error)) throw error
			if (attempt >= INVENTORY_ATTEMPTS) throw onBusy()
		}
	}
}
