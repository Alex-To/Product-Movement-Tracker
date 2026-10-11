import { Prisma, StopType } from '@prisma/client'
import { PrismaService } from '../prisma.service'

export type Ingredient = { idProduct: string; count: Prisma.Decimal }
export async function availableStock(
	db: Prisma.TransactionClient | PrismaService,
	asOf = new Date(),
	productIds?: string[]
) {
	const rows = await db.batch.groupBy({
		by: ['idProduct'],
		where: {
			...(productIds ? { idProduct: { in: productIds } } : {}),
			EXP: { gt: asOf },
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
export async function refreshAutoStops(
	tx: Prisma.TransactionClient,
	where: Prisma.DishWhereInput,
	asOf = new Date()
) {
	const dishes = await tx.dish.findMany({
		where: { AND: [where, { deletedAt: null }] },
		select: {
			id: true,
			ingredients: { select: { idProduct: true, count: true } }
		}
	})
	const ids = [
		...new Set(
			dishes.flatMap((dish) => dish.ingredients.map((item) => item.idProduct))
		)
	]
	const stock = await availableStock(tx, asOf, ids)
	for (const dish of dishes) {
		if (countPortions(dish.ingredients, stock) === 0)
			await tx.stopList.upsert({
				where: { idDish_type: { idDish: dish.id, type: StopType.AUTO } },
				create: { idDish: dish.id, type: StopType.AUTO },
				update: {}
			})
		else
			await tx.stopList.deleteMany({
				where: { idDish: dish.id, type: StopType.AUTO }
			})
	}
}
export async function inventoryTransaction<T>(
	db: PrismaService,
	work: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
	for (let attempt = 0; ; attempt++) {
		try {
			return await db.$transaction(work, { isolationLevel: 'Serializable' })
		} catch (error) {
			const retryable =
				error instanceof Prisma.PrismaClientKnownRequestError &&
				(error.code === 'P2034' ||
					(error.code === 'P2010' &&
						['40001', '40P01'].includes(String(error.meta?.code))))
			if (!retryable || attempt >= 2) throw error
		}
	}
}
