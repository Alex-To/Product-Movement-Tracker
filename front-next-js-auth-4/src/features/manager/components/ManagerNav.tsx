'use client'

import { Button } from '@/components/ui/Button'
import { Logo } from '@/components/ui/Logo'
import { PUBLIC_PAGES } from '@/config/pages/public.config'
import authService from '@/services/auth/auth.service'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { TbLogout, TbPackage } from 'react-icons/tb'
import { MANAGER_ROUTES } from '../config/manager.routes'

export function ManagerNav() {
	const pathname = usePathname()
	const router = useRouter()
	const queryClient = useQueryClient()

	const { mutate: logout, isPending } = useMutation({
		mutationKey: ['logout'],
		mutationFn: () => authService.logout(),
		onSuccess() {
			queryClient.clear()
			router.push(PUBLIC_PAGES.LOGIN)
		}
	})

	return (
		<header className="border-b border-border bg-surface-raised">
			<div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-4 sm:px-6">
				<Link href={MANAGER_ROUTES.HOME} aria-label="На главную кабинета"><Logo /></Link>
				<span className="border-l border-border pl-4 text-caption font-semibold text-ink-muted">Менеджер</span>
				<Button variant="ghost" size="sm" className="ml-auto" onClick={() => logout()} disabled={isPending}>
					<TbLogout size={18} aria-hidden /> Выйти
				</Button>
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
