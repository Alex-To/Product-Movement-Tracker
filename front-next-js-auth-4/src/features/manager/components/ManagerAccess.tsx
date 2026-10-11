'use client'

import { Button } from '@/components/ui/Button'
import { PUBLIC_PAGES } from '@/config/pages/public.config'
import userService from '@/services/user.service'
import { UserRole } from '@/types/auth.types'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { managerKeys } from '../api/manager.keys'
import { managerError } from '../api/manager.api'

export function ManagerAccess({
	children
}: {
	children: (userId: string) => ReactNode
}) {
	const session = useQuery({
		queryKey: managerKeys.session,
		queryFn: async () => (await userService.fetchProfile()).data,
		retry: false,
		gcTime: 0,
		staleTime: 0,
		refetchOnMount: 'always'
	})
	if (session.isPending) return <p role="status">Проверяем доступ…</p>
	if (session.isError || session.data?.role !== UserRole.MANAGER)
		return (
			<section className="rounded-lg border border-border bg-surface-raised p-6">
				<h1 className="!text-2xl">Доступ только для менеджера</h1>
				<p className="my-4 text-ink-muted">
					{session.isError
						? managerError(session.error)
						: 'Войдите под учётной записью менеджера. Текущая роль не имеет доступа к этому разделу.'}
				</p>
				<div className="flex flex-wrap gap-4">
					<Link className="text-accent underline" href={PUBLIC_PAGES.LOGIN}>
						Перейти ко входу
					</Link>
					<Button variant="ghost" onClick={() => session.refetch()}>
						Проверить доступ
					</Button>
				</div>
			</section>
		)
	return children(session.data.id)
}
