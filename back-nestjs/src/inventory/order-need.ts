import { Prisma } from '@prisma/client'

type Decimal = Prisma.Decimal
const ZERO = new Prisma.Decimal(0)

export type OrderLine = { dishId: string; count: number; excluded: string[] }

export type RecipeDish = {
	id: string
	name: string
	ingredients: {
		idProduct: string
		count: Decimal
		product: { nameProduct: string; unit: { name: string } }
	}[]
}

export type ProductNeed = {
	amount: Decimal
	productName: string
	unit: string
	dishes: { name: string; count: number }[]
}

export type Shortage = {
	productName: string
	unit: string
	need: string
	available: string
	dishes: { name: string; count: number }[]
}

/**
 * Строки чека: одно блюдо бывает несколькими строками — обычное и «без лука».
 * Одинаковые строки (блюдо + тот же набор «без») складываются
 */
export function mergeOrderLines(
	items: { dishId: string; count: number; excludedProductIds?: string[] }[]
): OrderLine[] {
	const lines = new Map<string, OrderLine>()
	for (const item of items) {
		const excluded = [...new Set(item.excludedProductIds ?? [])].sort()
		const key = `${item.dishId}|${excluded.join(',')}`
		const line = lines.get(key)
		if (line) line.count += item.count
		else lines.set(key, { dishId: item.dishId, count: item.count, excluded })
	}
	return [...lines.values()]
}

export const lineName = (dish: RecipeDish, excluded: string[]) =>
	excluded.length
		? `${dish.name} (без: ${dish.ingredients
				.filter((item) => excluded.includes(item.idProduct))
				.map((item) => item.product.nameProduct)
				.join(', ')})`
		: dish.name

/**
 * Потребность заказа в продуктах: порции × норма по каждой строке.
 * Продукты, которые гость попросил убрать, не нужны и со склада не списываются.
 * Одна функция и для проверки нехватки, и для списания по FEFO
 */
export function orderNeed(
	lines: OrderLine[],
	dishById: Map<string, RecipeDish>
): Map<string, ProductNeed> {
	const need = new Map<string, ProductNeed>()
	for (const line of lines) {
		const dish = dishById.get(line.dishId)
		if (!dish) continue
		const name = lineName(dish, line.excluded)
		for (const ingredient of dish.ingredients) {
			if (line.excluded.includes(ingredient.idProduct)) continue
			const entry = need.get(ingredient.idProduct) ?? {
				amount: ZERO,
				productName: ingredient.product.nameProduct,
				unit: ingredient.product.unit.name,
				dishes: []
			}
			entry.amount = entry.amount.plus(ingredient.count.mul(line.count))
			entry.dishes.push({ name, count: line.count })
			need.set(ingredient.idProduct, entry)
		}
	}
	return need
}

// Продукты, годного остатка которых меньше потребности заказа
export function findShortages(
	need: Map<string, ProductNeed>,
	stock: Map<string, Decimal>
): Shortage[] {
	return [...need.entries()]
		.filter(([productId, entry]) => (stock.get(productId) ?? ZERO).lt(entry.amount))
		.map(([productId, entry]) => ({
			productName: entry.productName,
			unit: entry.unit,
			need: entry.amount.toString(),
			available: (stock.get(productId) ?? ZERO).toString(),
			dishes: entry.dishes
		}))
}
