'use client'

import { KITCHEN_PAGES } from '@/config/pages/kitchen.config'
import { PUBLIC_PAGES } from '@/config/pages/public.config'
import authService from '@/services/auth/auth.service'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { twMerge } from 'tailwind-merge'

const links = [
	{ href: KITCHEN_PAGES.ORDERS, label: 'Заказы' },
	{ href: KITCHEN_PAGES.WRITE_OFF, label: 'Списание' },
	{ href: KITCHEN_PAGES.STOP_LIST, label: 'Стоп-лист' }
]

export function KitchenNav() {
	const pathname = usePathname()
	const router = useRouter()
	const queryClient = useQueryClient()

	const { mutate: logout, isPending } = useMutation({
		mutationKey: ['logout'],
		mutationFn: () => authService.logout(),
		onSuccess() {
			// Чтобы следующий сотрудник не увидел данные предыдущего
			queryClient.clear()
			router.push(PUBLIC_PAGES.LOGIN)
		}
	})

	return (
		<header className="flex flex-wrap items-center gap-4 border-b border-zinc-700 pb-3 mb-6">
			<b>Кухня</b>
			<nav className="flex flex-wrap gap-2 flex-1">
				{links.map(link => (
					<Link
						key={link.href}
						href={link.href}
						className={twMerge(
							'px-3 py-1 rounded',
							pathname === link.href && 'bg-zinc-700'
						)}
					>
						{link.label}
					</Link>
				))}
			</nav>
			<button
				type="button"
				onClick={() => logout()}
				disabled={isPending}
				className="px-3 py-1 border border-zinc-600 rounded"
			>
				Выйти
			</button>
		</header>
	)
}
