'use client'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Loading } from '@/components/ui/PizzaLoader'
import { ManagerAccess } from '../components/ManagerAccess'
import { managerError } from '../api/manager.api'
import { catalogInput, catalogLabel } from '../products/styles'
import { receiptDate } from '../deliveries/deliveries.api'
import { MANAGER_ROUTES } from '../config/manager.routes'
import {
	externalApi,
	requestStatus,
	type ExternalInterface
} from './external.api'
import { RequestReview } from './RequestReview'
import { ApiKeyDialog } from './ApiKeyDialog'

const card = 'rounded-lg border border-border bg-surface-raised p-5 sm:p-6'
function Pages({
	page,
	total,
	size,
	onChange
}: {
	page: number
	total: number
	size: number
	onChange: (page: number) => void
}) {
	return (
		<div className="mt-4 flex flex-wrap items-center gap-3">
			<Button
				size="sm"
				variant="secondary"
				disabled={page <= 1}
				onClick={() => onChange(page - 1)}
			>
				Назад
			</Button>
			<span>
				Страница {page} · Всего: {total}
			</span>
			<Button
				size="sm"
				variant="secondary"
				disabled={page * size >= total}
				onClick={() => onChange(page + 1)}
			>
				Далее
			</Button>
		</div>
	)
}
function Workspace({ userId }: { userId: string }) {
	const client = useQueryClient()
	const [tab, setTab] = useState<'requests' | 'keys'>('requests')
	const [page, setPage] = useState(1),
		[keyPage, setKeyPage] = useState(1),
		[status, setStatus] = useState('PENDING'),
		[search, setSearch] = useState('')
	const [selected, setSelected] = useState<string | null>(null),
		[name, setName] = useState(''),
		[secret, setSecret] = useState<{
			id: string
			name: string
			key?: string
		} | null>(null),
		[revoke, setRevoke] = useState<ExternalInterface | null>(null)
	const key = ['manager', 'external-interfaces', userId]
	const keys = useQuery({
		queryKey: [...key, 'keys', keyPage],
		queryFn: () => externalApi.interfaces(keyPage),
		enabled: tab === 'keys',
		retry: false
	})
	const filters = { page, status, search }
	const requests = useQuery({
		queryKey: [...key, 'requests', filters],
		queryFn: () => externalApi.requests(filters),
		enabled: tab === 'requests',
		refetchInterval: 15000,
		retry: false
	})
	const create = useMutation({
		mutationFn: externalApi.create,
		onSuccess: async (result) => {
			setSecret({ id: result.id, name: result.name, key: result.key })
			setName('')
			setKeyPage(1)
			await client.invalidateQueries({ queryKey: key })
			toast.success('Ключ создан')
		},
		onError: (e) => toast.error(managerError(e))
	})
	const remove = useMutation({
		mutationFn: (item: ExternalInterface) =>
			item.revokedAt
				? externalApi.restore(item.id)
				: externalApi.revoke(item.id),
		onSuccess: async (result) => {
			setRevoke(null)
			setKeyPage(1)
			await client.invalidateQueries({ queryKey: key })
			toast.success(
				result.revokedAt ? 'Ключ отозван' : 'Работа ключа восстановлена'
			)
		},
		onError: (e) => toast.error(managerError(e))
	})
	return (
		<>
			<h1>
				Внешние <span className="title-accent">интерфейсы</span>
			</h1>
			<p className="mt-2 mb-6 text-ink-muted">
				API-ключи интеграций и приёмка заявок на поставку.
			</p>
			<div className="mb-5 flex flex-wrap gap-3">
				<Button
					variant={tab === 'requests' ? 'primary' : 'secondary'}
					aria-pressed={tab === 'requests'}
					onClick={() => setTab('requests')}
				>
					Заявки на поставку
				</Button>
				<Button
					variant={tab === 'keys' ? 'primary' : 'secondary'}
					aria-pressed={tab === 'keys'}
					onClick={() => setTab('keys')}
				>
					API-ключи
				</Button>
			</div>
			{tab === 'keys' ? (
				<>
					<form
						className={`${card} mb-5`}
						onSubmit={(e) => {
							e.preventDefault()
							create.mutate(name.trim())
						}}
					>
						<h2 className="mb-4">Новый внешний интерфейс</h2>
						<div className="flex flex-wrap items-end gap-3">
							<label className={`${catalogLabel} flex-1`}>
								Название интерфейса
								<input
									className={catalogInput}
									value={name}
									maxLength={150}
									required
									onChange={(e) => setName(e.target.value)}
									placeholder="Например, система поставок"
								/>
							</label>
							<Button type="submit" disabled={!name.trim() || create.isPending}>
								Создать ключ
							</Button>
						</div>
						<p className="mt-3 text-caption text-ink-muted">
							Постоянный ключ действует до отзыва. Для просмотра нажмите на
							сокращённый ключ в списке.
						</p>
					</form>
					{keys.isPending ? (
						<Loading label="Загрузка интерфейсов…" />
					) : keys.isError ? (
						<p role="alert">{managerError(keys.error)}</p>
					) : (
						<section className={card}>
							<h2 className="mb-4">Интерфейсы</h2>
							{!keys.data.items.length && <p>Интерфейсов пока нет.</p>}
							<ul className="divide-y divide-border">
								{keys.data.items.map((item) => (
									<li
										key={item.id}
										className="flex flex-wrap items-center justify-between gap-3 py-4"
									>
										<div>
											<p className="font-semibold">{item.name}</p>
											<p className="text-caption text-ink-muted">
												<button
													type="button"
													className="cursor-pointer break-all text-gold-ink underline decoration-dotted underline-offset-4 hover:decoration-solid"
													aria-label={`Показать API-ключ ${item.name}`}
													onClick={() =>
														setSecret({ id: item.id, name: item.name })
													}
												>
													{item.prefix}…
												</button>{' '}
												· Создан {receiptDate(item.createdAt)}
											</p>
											<p
												className={`mt-2 inline-flex rounded-full border px-3 py-1 text-caption ${item.revokedAt ? 'border-danger/50 bg-danger/10 text-danger' : 'border-emerald-600/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'}`}
											>
												{item.revokedAt
													? `Отозван ${receiptDate(item.revokedAt)}`
													: 'Активен'}
											</p>
										</div>
										<Button
											variant="secondary"
											disabled={remove.isPending}
											onClick={() => setRevoke(item)}
										>
											{item.revokedAt
												? 'Восстановить работу ключа'
												: 'Удалить ключ'}
										</Button>
									</li>
								))}
							</ul>
							<Pages
								page={keyPage}
								total={keys.data.total}
								size={keys.data.pageSize}
								onChange={setKeyPage}
							/>
						</section>
					)}
				</>
			) : (
				<>
					<div className={`${card} mb-5 flex flex-wrap items-end gap-4`}>
						<label className={catalogLabel}>
							Статус
							<select
								className={catalogInput}
								value={status}
								onChange={(e) => {
									setStatus(e.target.value)
									setPage(1)
								}}
							>
								<option value="">Все</option>
								{Object.entries(requestStatus).map(([value, label]) => (
									<option key={value} value={value}>
										{label}
									</option>
								))}
							</select>
						</label>
						<label className={`${catalogLabel} flex-1`}>
							Номер накладной
							<input
								type="search"
								className={catalogInput}
								value={search}
								maxLength={100}
								onChange={(e) => {
									setSearch(e.target.value)
									setPage(1)
								}}
							/>
						</label>
						<Button
							variant="secondary"
							onClick={() => requests.refetch()}
							disabled={requests.isFetching}
						>
							Обновить
						</Button>
					</div>
					{requests.isPending ? (
						<Loading label="Загрузка заявок…" />
					) : requests.isError ? (
						<p role="alert">{managerError(requests.error)}</p>
					) : (
						<section className={card}>
							<h2 className="mb-4">Входящие заявки</h2>
							{!requests.data.items.length && (
								<p>Заявок по выбранным условиям нет.</p>
							)}
							<ul className="divide-y divide-border">
								{requests.data.items.map((item) => (
									<li
										key={item.id}
										className="flex flex-wrap items-center justify-between gap-3 py-4"
									>
										<div>
											<p className="font-semibold">
												Накладная {item.number} ·{' '}
												{item.supplierNameAtSubmission}
											</p>
											<p className="text-caption text-ink-muted">
												{item.interface.name} · {receiptDate(item.submittedAt)}{' '}
												· Строк: {item.lines.length}
											</p>
											<p>{requestStatus[item.status]}</p>
										</div>
										<Button
											variant="secondary"
											onClick={() => setSelected(item.id)}
										>
											Открыть заявку
										</Button>
									</li>
								))}
							</ul>
							<Pages
								page={page}
								total={requests.data.total}
								size={requests.data.pageSize}
								onChange={setPage}
							/>
						</section>
					)}
				</>
			)}
			{selected && (
				<RequestReview
					key={selected}
					userId={userId}
					id={selected}
					onClose={() => setSelected(null)}
				/>
			)}
			{secret && (
				<ApiKeyDialog
					key={secret.id}
					source={secret}
					onClose={() => setSecret(null)}
				/>
			)}
			<Modal
				isOpen={!!revoke}
				onClose={() => {
					if (!remove.isPending) setRevoke(null)
				}}
			>
				<h2 className="pr-8">
					{revoke?.revokedAt ? 'Восстановить работу ключа?' : 'Удалить ключ?'}
				</h2>
				<p className="my-4">
					{revoke?.revokedAt
						? `Интерфейс «${revoke.name}» снова получит доступ к API по прежнему ключу.`
						: `Интерфейс «${revoke?.name}» потеряет доступ к API. Его заявки сохранятся и останутся доступны для приёмки.`}
				</p>
				<div className="flex gap-3">
					<Button
						disabled={remove.isPending}
						onClick={() => remove.mutate(revoke!)}
					>
						{revoke?.revokedAt ? 'Да, восстановить' : 'Да, удалить'}
					</Button>
					<Button
						variant="secondary"
						disabled={remove.isPending}
						onClick={() => setRevoke(null)}
					>
						Нет
					</Button>
				</div>
			</Modal>
			<p className="mt-5 text-caption text-ink-muted">
				Принятые заявки также появляются в разделе{' '}
				<Link className="underline" href={MANAGER_ROUTES.DELIVERIES}>
					«Поставки»
				</Link>
				.
			</p>
		</>
	)
}
export function ExternalInterfacesWorkspace() {
	return (
		<ManagerAccess>{(userId) => <Workspace userId={userId} />}</ManagerAccess>
	)
}
