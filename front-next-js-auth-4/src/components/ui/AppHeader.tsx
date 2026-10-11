'use client'

import { PUBLIC_PAGES } from '@/config/pages/public.config'
import { ROLE_LABELS } from '@/config/pages/role.config'
import { useProfile } from '@/hooks/useProfile'
import authService from '@/services/auth/auth.service'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { TbLogout } from 'react-icons/tb'
import { twMerge } from '@/utils/tw-merge'
import { Button } from './Button'
import { Logo } from './Logo'
import { ThemeToggle } from './ThemeToggle'

export interface IHeaderTab {
	href: string
	label: string
	isActive: boolean
	icon?: ReactNode
}

interface Props {
	homeHref: string
	tabs?: IHeaderTab[]
	tabsLabel?: string
	// inline — вкладки в строке с логотипом (кухня), below — отдельной строкой (менеджер)
	tabsPlacement?: 'inline' | 'below'
}

// Общая шапка всех ролей: логотип слева; справа пользователь, «Выйти» и тема —
// всегда в одном и том же месте
export function AppHeader({ homeHref, tabs, tabsLabel, tabsPlacement = 'below' }: Props) {
	const router = useRouter()
	const queryClient = useQueryClient()
	const { user } = useProfile()

	const { mutate: logout, isPending } = useMutation({
		mutationKey: ['logout'],
		mutationFn: () => authService.logout(),
		onSuccess() {
			// Чтобы следующий сотрудник не увидел данные предыдущего
			queryClient.clear()
			router.push(PUBLIC_PAGES.LOGIN)
		}
	})

	const isInline = tabsPlacement === 'inline'

	const nav = tabs?.length ? (
		<nav
			aria-label={tabsLabel}
			className={twMerge(
				'order-last w-full overflow-x-auto',
				isInline && 'lg:order-none lg:w-auto'
			)}
		>
			<div
				className={twMerge(
					'gap-1 rounded-full bg-tint p-1',
					isInline ? 'flex lg:inline-flex' : 'inline-flex'
				)}
			>
				{tabs.map(tab => (
					<Link
						key={tab.href}
						href={tab.href}
						aria-current={tab.isActive ? 'page' : undefined}
						className={twMerge(
							'inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-4 font-semibold whitespace-nowrap transition-colors sm:px-5',
							isInline && 'flex-1 lg:flex-none',
							tab.isActive
								? 'bg-accent text-on-accent'
								: 'text-ink hover:bg-surface-raised'
						)}
					>
						{tab.icon}
						{tab.label}
					</Link>
				))}
			</div>
		</nav>
	) : null

	return (
		<header className="sticky top-0 z-30 border-b border-border bg-surface-raised">
			<div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-3 px-3 py-3 sm:gap-x-5 sm:px-6">
				<Link
					href={homeHref}
					aria-label="На главную кабинета"
					className="shrink-0"
				>
					<Logo className="h-7 w-auto sm:h-10" />
				</Link>

				{isInline && nav}

				{/* Нулевая основа и min-w-0: на узком телефоне блок не переносится под логотип,
				    а имя и логин сокращаются многоточием */}
				<div className="ml-auto flex min-w-0 flex-1 basis-0 items-center justify-end gap-2 sm:gap-3">
					{user.login && (
						<div className="min-w-0 text-right leading-tight">
							<div className="truncate text-caption font-semibold sm:text-body">
								{user.name}
							</div>
							<div className="truncate text-[11px] text-ink-muted sm:text-caption">
								{user.login} · {user.role && ROLE_LABELS[user.role]}
							</div>
						</div>
					)}
					<Button
						variant="secondary"
						size="sm"
						className="min-h-10 shrink-0 px-3 sm:min-h-11 sm:px-4"
						onClick={() => logout()}
						disabled={isPending}
					>
						<TbLogout
							size={18}
							aria-hidden
						/>
						Выйти
					</Button>
					<ThemeToggle />
				</div>

				{!isInline && nav}
			</div>
		</header>
	)
}
