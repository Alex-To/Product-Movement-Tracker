'use client'

import { Logo } from '@/components/ui/Logo'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { TbArrowLeft, TbPackage } from 'react-icons/tb'
import { MANAGER_ROUTES } from '../config/manager.routes'

export function ManagerNav() {
	const pathname = usePathname()
	return (
		<header className="border-b border-border bg-surface-raised">
			<div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-4 sm:px-6">
				<Link href="/" aria-label="На главную"><Logo /></Link>
				<span className="border-l border-border pl-4 text-caption font-semibold text-ink-muted">Менеджер</span>
				<Link href="/" className="ml-auto inline-flex items-center gap-2 text-caption font-semibold text-accent hover:underline">
					<TbArrowLeft size={17} aria-hidden /> На главную
				</Link>
				<nav aria-label="Разделы менеджера" className="flex w-full flex-wrap gap-2">
					<Link href={MANAGER_ROUTES.WAREHOUSE} aria-current={pathname === MANAGER_ROUTES.WAREHOUSE ? 'page' : undefined} className={`inline-flex min-h-10 items-center rounded-md px-3 font-semibold ${pathname === MANAGER_ROUTES.WAREHOUSE ? 'bg-tint text-accent' : 'text-ink-muted hover:bg-tint'}`}>Склад</Link>
					<Link href={MANAGER_ROUTES.DISHES} aria-current={pathname.startsWith(MANAGER_ROUTES.DISHES) ? 'page' : undefined} className={`inline-flex min-h-10 items-center rounded-md px-3 font-semibold ${pathname.startsWith(MANAGER_ROUTES.DISHES) ? 'bg-tint text-accent' : 'text-ink-muted hover:bg-tint'}`}>Блюда и рецептуры</Link>
					<Link href={MANAGER_ROUTES.DELIVERIES} aria-current={pathname.startsWith(MANAGER_ROUTES.DELIVERIES) ? 'page' : undefined} className={`inline-flex min-h-10 items-center gap-2 rounded-md px-3 font-semibold ${pathname.startsWith(MANAGER_ROUTES.DELIVERIES) ? 'bg-tint text-accent' : 'text-ink-muted hover:bg-tint'}`}>Поставки</Link>
					<Link href={MANAGER_ROUTES.PRODUCTS} aria-current={pathname === MANAGER_ROUTES.PRODUCTS ? 'page' : undefined}
						className={`inline-flex min-h-10 items-center gap-2 rounded-md px-3 font-semibold ${pathname === MANAGER_ROUTES.PRODUCTS ? 'bg-tint text-accent' : 'text-ink-muted hover:bg-tint'}`}>
						<TbPackage size={20} aria-hidden /> Продукты
					</Link>
				</nav>
			</div>
		</header>
	)
}
