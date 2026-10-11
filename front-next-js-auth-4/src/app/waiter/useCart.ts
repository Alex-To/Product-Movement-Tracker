'use client'

import type { IMenuDish } from '@/types/waiter.types'
import { useCallback, useEffect, useState } from 'react'

// Строка чека: блюдо и продукты, которые гость попросил убрать.
// «Цезарь» и «Цезарь без сухариков» — разные строки одного блюда
export interface ICartLine {
	dishId: string
	excluded: string[]
	count: number
}

// Ключ — lineKey(); порядок ключей = порядок добавления в чек
export type TCart = Record<string, ICartLine>

export interface ICartAdjustment {
	name: string
	from: number
	to: number
	// shared — продукты блюда заняты другими блюдами чека
	reason?: 'shared'
}

export const lineKey = (dishId: string, excluded: string[] = []) =>
	excluded.length ? `${dishId}|${[...excluded].sort().join(',')}` : dishId

export const excludedNames = (dish: IMenuDish | undefined, excluded: string[]) =>
	(dish?.ingredients ?? [])
		.filter(item => excluded.includes(item.productId))
		.map(item => item.name)

export const lineName = (dish: IMenuDish | undefined, excluded: string[]) => {
	const name = dish?.name ?? 'Блюдо'
	return excluded.length
		? `${name} без: ${excludedNames(dish, excluded).join(', ')}`
		: name
}

// Порций блюда в чеке по всем его строкам
export const dishCounts = (cart: TCart) => {
	const counts: Record<string, number> = {}
	for (const line of Object.values(cart)) {
		counts[line.dishId] = (counts[line.dishId] ?? 0) + line.count
	}
	return counts
}

// Decimal(12,3) в целых тысячных — складываем без ошибок округления float
const toMilli = (value: string) => Math.round(Number(value) * 1000)

// Продукты строки: убранные гостем не тратятся
const lineProducts = (line: ICartLine, menu: IMenuDish[]) =>
	(menu.find(d => d.id === line.dishId)?.ingredients ?? []).filter(
		item => !line.excluded.includes(item.productId)
	)

// Продукты, которых чеку не хватает. У разных блюд бывают общие ингредиенты,
// поэтому остаток одного блюда ничего не гарантирует для всего чека
const overusedProducts = (cart: TCart, menu: IMenuDish[]) => {
	const used = new Map<string, number>()
	const available = new Map<string, number>()

	for (const line of Object.values(cart)) {
		for (const item of lineProducts(line, menu)) {
			used.set(
				item.productId,
				(used.get(item.productId) ?? 0) + toMilli(item.perPortion) * line.count
			)
			available.set(item.productId, toMilli(item.available))
		}
	}

	const overused = new Set<string>()
	for (const [productId, amount] of used) {
		if (amount > (available.get(productId) ?? 0)) overused.add(productId)
	}
	return overused
}

const increment = (cart: TCart, dishId: string, excluded: string[]): TCart => {
	const key = lineKey(dishId, excluded)
	const count = cart[key]?.count ?? 0
	return { ...cart, [key]: { dishId, excluded, count: count + 1 } }
}

const canAddTo = (
	cart: TCart,
	dish: IMenuDish,
	excluded: string[],
	menu: IMenuDish[]
) =>
	!dish.isStopped &&
	excluded.length < dish.ingredients.length &&
	overusedProducts(increment(cart, dish.id, excluded), menu).size === 0

export function useCart(menu: IMenuDish[] | undefined) {
	const [cart, setCart] = useState<TCart>({})
	const [adjustments, setAdjustments] = useState<
		Record<string, ICartAdjustment>
	>({})

	useEffect(() => {
		if (!menu) return

		const changed: Record<string, ICartAdjustment> = {}
		const next: TCart = {}

		for (const [key, line] of Object.entries(cart)) {
			const dish = menu.find(d => d.id === line.dishId)
			// Блюдо убрали из меню или поставили в стоп-лист
			if (!dish || dish.isStopped) {
				changed[key] = {
					name: lineName(dish, line.excluded),
					from: line.count,
					to: 0
				}
			} else {
				next[key] = { ...line }
			}
		}

		// Остатков стало меньше — снимаем порции с последних добавленных строк,
		// которые тратят нехватающие продукты
		for (const key of Object.keys(next).reverse()) {
			const line = next[key]
			const dish = menu.find(d => d.id === line.dishId)
			const before = line.count
			let shared = false

			while (line.count > 0) {
				const overused = overusedProducts(next, menu)
				const mine = lineProducts(line, menu)
					.map(item => item.productId)
					.filter(id => overused.has(id))
				if (!mine.length) break
				// Тот же продукт нужен и другим строкам чека
				shared ||= Object.entries(next).some(
					([other, otherLine]) =>
						other !== key &&
						otherLine.count > 0 &&
						lineProducts(otherLine, menu).some(item => mine.includes(item.productId))
				)
				line.count--
			}

			if (line.count !== before) {
				changed[key] = {
					name: lineName(dish, line.excluded),
					from: before,
					to: line.count,
					...(shared && { reason: 'shared' as const })
				}
			}
			if (line.count === 0) delete next[key]
		}

		if (Object.keys(changed).length) {
			setCart(next)
			setAdjustments(prev => ({ ...prev, ...changed }))
		}
	}, [menu, cart])

	const forget = (key: string) =>
		setAdjustments(prev => {
			if (!prev[key]) return prev
			const { [key]: _, ...rest } = prev
			return rest
		})

	const add = useCallback(
		(dish: IMenuDish, excluded: string[] = []) => {
			if (!menu) return
			forget(lineKey(dish.id, excluded))
			setCart(prev =>
				canAddTo(prev, dish, excluded, menu)
					? increment(prev, dish.id, excluded)
					: prev
			)
		},
		[menu]
	)

	const canAdd = useCallback(
		(dish: IMenuDish, excluded: string[] = []) =>
			!!menu && canAddTo(cart, dish, excluded, menu),
		[cart, menu]
	)

	const remove = useCallback((key: string) => {
		forget(key)
		setCart(prev => {
			const line = prev[key]
			if (!line) return prev
			if (line.count <= 1) {
				const { [key]: _, ...rest } = prev
				return rest
			}
			return { ...prev, [key]: { ...line, count: line.count - 1 } }
		})
	}, [])

	const clear = useCallback(() => {
		setCart({})
		setAdjustments({})
	}, [])

	// Сервер считает доступные порции по полному составу блюда —
	// урезаем строки блюда с конца, пока не уложимся
	const limitTo = useCallback((limits: { dishId: string; portions: number }[]) => {
		setCart(prev => {
			const next: TCart = {}
			for (const [key, line] of Object.entries(prev)) next[key] = { ...line }

			for (const { dishId, portions } of limits) {
				let extra = (dishCounts(next)[dishId] ?? 0) - portions
				for (const key of Object.keys(next).reverse()) {
					if (extra <= 0) break
					if (next[key].dishId !== dishId) continue
					const take = Math.min(extra, next[key].count)
					next[key].count -= take
					extra -= take
					if (next[key].count === 0) delete next[key]
				}
			}
			return next
		})
		setAdjustments({})
	}, [])

	const totalPortions = Object.values(cart).reduce((sum, line) => sum + line.count, 0)

	return { cart, adjustments, add, canAdd, remove, clear, limitTo, totalPortions }
}
