'use client'

import { Button } from '@/components/ui/Button'
import { Logo } from '@/components/ui/Logo'
import { WAITER_PAGES } from '@/config/pages/waiter.config'
import { PUBLIC_PAGES } from '@/config/pages/public.config'
import { ROLE_LABELS } from '@/config/pages/role.config'
import { useProfile } from '@/hooks/useProfile'
import authService from '@/services/auth/auth.service'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { TbLogout } from 'react-icons/tb'
import { twMerge } from 'tailwind-merge'

const links = [{ href: WAITER_PAGES.MENU, label: 'Меню' }]

export function WaiterNav() {
	const pathname = usePathname()
	const router = useRouter()
	const queryClient = useQueryClient()
	const { user } = useProfile()

	const { mutate: logout, isPending } = useMutation({
		mutationKey: ['logout'],
		mutationFn: () => authService.logout(),
		onSuccess() {
			queryClient.clear()
			router.push(PUBLIC_PAGES.LOGIN)
		}
	})

	return (
		<header className="sticky top-0 z-30 border-b border-border bg-surface-raised">
			<div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
				<Link
					href={WAITER_PAGES.HOME}
					aria-label="На главную кабинета"
				>
					<Logo />
				</Link>

				<nav className="order-last flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
					{links.map(link => {
						const isActive = pathname === link.href
						return (
							<Link
								key={link.href}
								href={link.href}
								aria-current={isActive ? 'page' : undefined}
								className={twMerge(
									'rounded-md px-3 py-2 font-semibold whitespace-nowrap transition-colors',
									isActive
										? 'bg-tint text-accent'
										: 'text-ink-muted hover:bg-tint hover:text-ink'
								)}
							>
								{link.label}
							</Link>
						)
					})}
				</nav>

				<div className="ml-auto flex items-center gap-3">
					{user.login && (
						<div className="hidden text-right sm:block">
							<div className="font-semibold leading-5">{user.name}</div>
							<div className="font-mono text-caption text-ink-muted">
								{user.login} · {user.role && ROLE_LABELS[user.role]}
							</div>
						</div>
					)}
					<Button
						variant="ghost"
						size="sm"
						onClick={() => logout()}
						disabled={isPending}
					>
						<TbLogout
							size={18}
							aria-hidden
						/>
						Выйти
					</Button>
				</div>
			</div>
		</header>
	)
}
