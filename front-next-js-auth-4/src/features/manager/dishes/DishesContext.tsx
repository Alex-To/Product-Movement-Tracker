'use client'
import { createContext, useContext } from 'react'
export const DishesUserContext = createContext<string | null>(null)
export function useDishesUser() {
	const userId = useContext(DishesUserContext)
	if (!userId) throw new Error('Dish panel requires DishesWorkspace')
	return userId
}
