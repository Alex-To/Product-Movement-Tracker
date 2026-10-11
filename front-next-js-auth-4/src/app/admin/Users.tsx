'use client'

import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ROLE_LABELS } from '@/config/pages/role.config'
import { useProfile } from '@/hooks/useProfile'
import adminService from '@/services/admin.service'
import { UserRole } from '@/types/auth.types'
import { IUser } from '@/types/user.types'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { TbPencil, TbPlus, TbTrash } from 'react-icons/tb'
import { twMerge } from 'tailwind-merge'
import { UserForm } from './UserForm'
import { USERS_QUERY_KEY, useDeleteUser } from './useUserMutations'

type TPanelState = null | 'new' | IUser

const cellClass = 'px-4 py-3 align-middle'

export function Users() {
	const { user: currentUser } = useProfile()
	const [panel, setPanel] = useState<TPanelState>(null)
	const [userToDelete, setUserToDelete] = useState<IUser | null>(null)
	const panelRef = useRef<HTMLElement>(null)

	const panelKey = panel === null ? null : panel === 'new' ? 'new' : panel.id
	useEffect(() => {
		if (panelKey && window.matchMedia('(max-width: 1023px)').matches) {
			panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
		}
	}, [panelKey])

	const { data, isLoading, isError } = useQuery({
		queryKey: USERS_QUERY_KEY,
		queryFn: () => adminService.fetchUsers(),
		select: response => response.data
	})

	const { mutate: deleteUser, isPending: isDeleting } = useDeleteUser({
		onSuccess() {
			toast.success('Сотрудник удалён')
			if (panel !== null && panel !== 'new' && panel.id === userToDelete?.id) {
				setPanel(null)
			}
			setUserToDelete(null)
		},
		onError(message) {
			toast.error(message)
			setUserToDelete(null)
		}
	})

	const editingId = panel !== null && panel !== 'new' ? panel.id : null
	const canDelete = (user: IUser) =>
		user.role !== UserRole.ADMIN && user.id !== currentUser.id

	return (
		<div className="flex flex-col gap-6 lg:flex-row lg:items-start">
			<section className="min-w-0 flex-1">
				<div className="mb-6 flex flex-wrap items-end justify-between gap-4">
					<div>
						<h1>Сотрудники</h1>
						<p className="mt-1 text-caption text-ink-muted">
							Каждый видит только экраны своей роли
							{data && ` · всего ${data.length}`}
						</p>
					</div>
					<Button onClick={() => setPanel('new')}>
						<TbPlus
							size={20}
							aria-hidden
						/>
						Добавить сотрудника
					</Button>
				</div>

				<div className="overflow-x-auto rounded-md border border-border bg-surface-raised shadow-card">
					<table className="w-full min-w-[600px] border-collapse text-left">
						<thead className="text-caption font-semibold text-ink-muted">
							<tr className="border-b border-border">
								<th className={cellClass}>Имя</th>
								<th className={cellClass}>Логин</th>
								<th className={cellClass}>Роль</th>
								<th className={cellClass}>
									<span className="sr-only">Действия</span>
								</th>
							</tr>
						</thead>
						<tbody>
							{isLoading ? (
								<tr>
									<td
										colSpan={4}
										className="py-10"
									>
										<div
											role="status"
											aria-label="Загрузка"
											className="mx-auto size-8 animate-spin rounded-full border-2 border-border border-t-accent"
										/>
									</td>
								</tr>
							) : isError ? (
								<tr>
									<td
										colSpan={4}
										className="px-4 py-8 text-center text-danger"
									>
										Не удалось загрузить сотрудников. Обновите страницу.
									</td>
								</tr>
							) : data?.length ? (
								data.map(user => (
									<tr
										key={user.id}
										className={twMerge(
											'border-t border-border first:border-t-0 transition-colors',
											editingId === user.id ? 'bg-tint' : 'hover:bg-surface'
										)}
									>
										<td className={twMerge(cellClass, 'font-semibold whitespace-nowrap')}>
											{user.name}
											{user.id === currentUser.id && (
												<span className="ml-2 text-caption font-normal text-ink-muted">
													это вы
												</span>
											)}
										</td>
										<td className={twMerge(cellClass, 'font-mono text-caption')}>
											{user.login}
										</td>
										<td className={cellClass}>
											{ROLE_LABELS[user.role]}
											<span className="ml-2 font-mono text-caption text-ink-muted">
												{user.role}
											</span>
										</td>
										<td className={cellClass}>
											<div className="flex justify-end gap-2">
												<Button
													variant="secondary"
													size="sm"
													onClick={() => setPanel(user)}
												>
													<TbPencil
														size={16}
														aria-hidden
													/>
													Изменить
												</Button>
												{canDelete(user) && (
													<Button
														variant="secondary"
														size="sm"
														onClick={() => setUserToDelete(user)}
													>
														<TbTrash
															size={16}
															aria-hidden
														/>
														Удалить
													</Button>
												)}
											</div>
										</td>
									</tr>
								))
							) : (
								<tr>
									<td
										colSpan={4}
										className="px-4 py-8 text-center text-ink-muted"
									>
										Сотрудников пока нет
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</section>

			{panel !== null && (
				<aside
					ref={panelRef}
					className="w-full shrink-0 rounded-lg border border-border bg-surface-raised p-6 shadow-card lg:sticky lg:top-24 lg:w-96">
					<UserForm
						key={panelKey}
						user={panel === 'new' ? null : panel}
						onClose={() => setPanel(null)}
					/>
				</aside>
			)}

			<Modal
				isOpen={!!userToDelete}
				onClose={() => !isDeleting && setUserToDelete(null)}
			>
				<h2 className="mb-3 pr-8">Удалить сотрудника?</h2>
				<p className="mb-6 text-ink-muted">
					{userToDelete?.name}{' '}
					<span className="font-mono text-caption">({userToDelete?.login})</span>{' '}
					больше не сможет войти. Действие нельзя отменить.
				</p>
				<div className="flex flex-wrap gap-2">
					<Button
						disabled={isDeleting}
						onClick={() => userToDelete && deleteUser(userToDelete.id)}
					>
						{isDeleting ? 'Удаление…' : 'Удалить'}
					</Button>
					<Button
						variant="ghost"
						disabled={isDeleting}
						onClick={() => setUserToDelete(null)}
					>
						Отмена
					</Button>
				</div>
			</Modal>
		</div>
	)
}
