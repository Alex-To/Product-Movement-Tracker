'use client'
import { MiniLoader } from '@/components/ui/MiniLoader'
import { PUBLIC_PAGES } from '@/config/pages/public.config'
import { useProfile } from '@/hooks/useProfile'
import authService from '@/services/auth/auth.service'
import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { twMerge } from 'tailwind-merge'

export function ProfileInfo() {
	const router = useRouter()

	const { isLoading, refetch, user } = useProfile()

	const [isPending, startTransition] = useTransition()

	const { mutate: mutateLogout, isPending: isLogoutPending } = useMutation({
		mutationKey: ['logout'],
		mutationFn: () => authService.logout(),
		onSuccess() {
			refetch()
			startTransition(() => {
				router.push(PUBLIC_PAGES.LOGIN)
			})
		}
	})

	const isLogoutLoading = isLogoutPending || isPending

	if (isLoading)
		return (
			<div className="mt-10">
				<MiniLoader
					isDark
					width={150}
					height={150}
				/>
			</div>
		)

	return (
		<div className="mt-10">
			<h2 className="text-2xl font-bold">Привет, {user.name}</h2>
			<br />
			<p className="text-lg">Логин: {user.login}</p>
			<br />
			<p>Роль: {user.role}</p>
			<br />
			<button
				onClick={() => mutateLogout()}
				disabled={isLogoutLoading}
				className={twMerge(
					'mt-2 bg-accent text-on-accent font-semibold px-4 min-h-11 rounded-md',
					isLogoutLoading && 'bg-stop-tint text-ink-muted'
				)}
			>
				{isLogoutLoading ? <MiniLoader /> : 'Выйти'}
			</button>
		</div>
	)
}
