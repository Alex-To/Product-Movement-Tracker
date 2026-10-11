import type { ReactNode } from 'react'
import { DishesWorkspace } from '@/features/manager/dishes/DishesWorkspace'
export default function Layout({ children }: { children: ReactNode }) {
	return <DishesWorkspace>{children}</DishesWorkspace>
}
