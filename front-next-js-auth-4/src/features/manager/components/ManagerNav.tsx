'use client'

import { AppHeader } from '@/components/ui/AppHeader'
import { twMerge } from '@/utils/tw-merge'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { TbPackage, TbSettings } from 'react-icons/tb'
import { MANAGER_ROUTES } from '../config/manager.routes'

export function ManagerNav() {
	const pathname = usePathname()
	const isSettings = pathname === MANAGER_ROUTES.SETTINGS

	return (
		<AppHeader
			homeHref={MANAGER_ROUTES.HOME}
			tabsLabel="Разделы менеджера"
			tabs={[
				{ href: MANAGER_ROUTES.WAREHOUSE, label: 'Склад', isActive: pathname === MANAGER_ROUTES.WAREHOUSE },
				{ href: MANAGER_ROUTES.STATISTICS, label: 'Статистика', isActive: pathname.startsWith(MANAGER_ROUTES.STATISTICS) },
				{ href: MANAGER_ROUTES.DISHES, label: 'Блюда и рецептуры', isActive: pathname.startsWith(MANAGER_ROUTES.DISHES) },
				{ href: MANAGER_ROUTES.DELIVERIES, label: 'Поставки', isActive: pathname.startsWith(MANAGER_ROUTES.DELIVERIES) },
				{
					href: MANAGER_ROUTES.PRODUCTS,
					label: 'Продукты',
					isActive: pathname === MANAGER_ROUTES.PRODUCTS,
					icon: <TbPackage size={18} aria-hidden />
				},
				{ href: MANAGER_ROUTES.EXTERNAL_INTERFACES, label: 'Внешние интерфейсы', isActive: pathname.startsWith(MANAGER_ROUTES.EXTERNAL_INTERFACES) }
			]}
			actions={
				// Круглая кнопка того же размера, что и переключатель темы
				<Link
					href={MANAGER_ROUTES.SETTINGS}
					aria-label="Настройки"
					title="Настройки ресторана"
					aria-current={isSettings ? 'page' : undefined}
					className={twMerge(
						'inline-flex size-10 shrink-0 items-center justify-center rounded-full border transition-colors sm:size-11',
						'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
						isSettings
							? 'border-accent bg-accent text-on-accent'
							: 'border-border-strong bg-surface-raised text-ink hover:bg-tint'
					)}
				>
					<TbSettings
						size={18}
						aria-hidden
					/>
				</Link>
			}
		/>
	)
}
