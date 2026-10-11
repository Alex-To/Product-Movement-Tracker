'use client'

import type { IMenuDish } from '@/types/waiter.types'
import { useCallback, useEffect, useState } from 'react'

export type TCart = Record<string, number>

export interface ICartAdjustment {
	name: string
	from: number
	to: number
}

const maxPortions = (dish: IMenuDish | undefined) =>
	!dish || dish.isStopped ? 0 : dish.portions

export function useCart(menu: IMenuDish[] | undefined) {
	const [cart, setCart] = useState<TCart>({})
	const [adjustments, setAdjustments] = useState<
		Record<string, ICartAdjustment>
	>({})

	useEffect(() => {
		if (!menu) return

		const changed: Record<string, ICartAdjustment> = {}
		const next: TCart = {}

		for (const [dishId, count] of Object.entries(cart)) {
			const dish = menu.find(d => d.id === dishId)
			const max = maxPortions(dish)

			if (count > max) {
				changed[dishId] = { name: dish?.name ?? 'Блюдо', from: count, to: max }
				if (max > 0) next[dishId] = max
			} else {
				next[dishId] = count
			}
		}

		if (Object.keys(changed).length) {
			setCart(next)
			setAdjustments(prev => ({ ...prev, ...changed }))
		}
	}, [menu, cart])

	const forget = (dishId: string) =>
		setAdjustments(prev => {
			if (!prev[dishId]) return prev
			const { [dishId]: _, ...rest } = prev
			return rest
		})

	const add = useCallback(
		(dish: IMenuDish) => {
			forget(dish.id)
			setCart(prev => {
				const count = prev[dish.id] ?? 0
				if (count >= maxPortions(dish)) return prev
				return { ...prev, [dish.id]: count + 1 }
			})
		},
		[]
	)

	const remove = useCallback((dishId: string) => {
		forget(dishId)
		setCart(prev => {
			const count = prev[dishId] ?? 0
			if (count <= 1) {
				const { [dishId]: _, ...rest } = prev
				return rest
			}
			return { ...prev, [dishId]: count - 1 }
		})
	}, [])

	const clear = useCallback(() => {
		setCart({})
		setAdjustments({})
	}, [])

	const limitTo = useCallback((limits: { dishId: string; portions: number }[]) => {
		setCart(prev => {
			const next = { ...prev }
			for (const { dishId, portions } of limits) {
				if (next[dishId] === undefined || next[dishId] <= portions) continue
				if (portions > 0) next[dishId] = portions
				else delete next[dishId]
			}
			return next
		})
		setAdjustments({})
	}, [])

	const totalPortions = Object.values(cart).reduce((sum, n) => sum + n, 0)

	return { cart, adjustments, add, remove, clear, limitTo, totalPortions }
}
