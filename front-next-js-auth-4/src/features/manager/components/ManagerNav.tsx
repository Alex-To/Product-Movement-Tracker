'use client'

import { AppHeader } from '@/components/ui/AppHeader'
import { usePathname } from 'next/navigation'
import { TbPackage } from 'react-icons/tb'
import { MANAGER_ROUTES } from '../config/manager.routes'

export function ManagerNav() {
	const pathname = usePathname()

	return (
		<AppHeader
			homeHref={MANAGER_ROUTES.HOME}
			tabsLabel="Разделы менеджера"
			tabs={[
				{ href: MANAGER_ROUTES.WAREHOUSE, label: 'Склад', isActive: pathname === MANAGER_ROUTES.WAREHOUSE },
				{ href: MANAGER_ROUTES.DISHES, label: 'Блюда и рецептуры', isActive: pathname.startsWith(MANAGER_ROUTES.DISHES) },
				{ href: MANAGER_ROUTES.DELIVERIES, label: 'Поставки', isActive: pathname.startsWith(MANAGER_ROUTES.DELIVERIES) },
				{
					href: MANAGER_ROUTES.PRODUCTS,
					label: 'Продукты',
					isActive: pathname === MANAGER_ROUTES.PRODUCTS,
					icon: <TbPackage size={18} aria-hidden />
				}
			]}
		/>
	)
}
