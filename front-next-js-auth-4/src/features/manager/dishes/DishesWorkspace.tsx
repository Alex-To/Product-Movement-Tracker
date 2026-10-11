'use client'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import toast from 'react-hot-toast'
import { ManagerAccess } from '../components/ManagerAccess'
import { MANAGER_ROUTES } from '../config/manager.routes'
import { managerError } from '../api/manager.api'
import { managerKeys } from '../api/manager.keys'
import { catalogInput } from '../products/styles'
import { dishesApi, dishKeys, type ManagerDish } from './dishes.api'
import { DishesUserContext } from './DishesContext'

type Confirmation = { dish: ManagerDish; action: 'trash' | 'restore' }
function Workspace({
	userId,
	children
}: {
	userId: string
	children: ReactNode
}) {
	const client = useQueryClient(),
		router = useRouter(),
		pathname = usePathname()
	const [scope, setScope] = useState('active'),
		[draft, setDraft] = useState(''),
		[search, setSearch] = useState(''),
		[page, setPage] = useState(1)
	const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
	const filters = { scope, search, page }
	const query = useQuery({
		queryKey: dishKeys.list(userId, filters),
		queryFn: () => dishesApi.list(filters),
		retry: false
	})
	const change = useMutation({
		mutationFn: ({ dish, action }: Confirmation) =>
			dishesApi.state(dish, action),
		async onSuccess(result) {
			setConfirmation(null)
			if (pathname === `${MANAGER_ROUTES.DISHES}/${result.dish.id}`)
				router.replace(MANAGER_ROUTES.DISHES)
			await Promise.all([
				client.invalidateQueries({ queryKey: dishKeys.all }),
				client.invalidateQueries({ queryKey: managerKeys.catalog })
			])
			toast.success(
				result.dish.deletedAt ? 'Блюдо в корзине' : 'Блюдо восстановлено'
			)
			result.warnings.forEach((warning) => toast(warning))
			if (query.data?.items.length === 1 && page > 1)
				setPage((value) => value - 1)
		},
		onError(error) {
			setConfirmation(null)
			toast.error(managerError(error))
			query.refetch()
		}
	})
	useEffect(() => {
		if (!confirmation) return
		const escape = (event: KeyboardEvent) => {
			if (event.key === 'Escape' && !change.isPending) setConfirmation(null)
		}
		window.addEventListener('keydown', escape)
		return () => window.removeEventListener('keydown', escape)
	}, [confirmation, change.isPending])
	return (
		<DishesUserContext.Provider value={userId}>
			<div className="mb-6 flex flex-wrap items-start justify-between gap-4">
				<div>
					<h1>
						Блюда и <span className="title-accent">рецептуры</span>
					</h1>
				</div>
				<Link
					className="rounded-md bg-accent px-4 py-3 font-semibold text-on-accent"
					href={`${MANAGER_ROUTES.DISHES}/new`}
				>
					Новое блюдо
				</Link>
			</div>
			<div className="grid items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
				<aside
					aria-label="Список блюд"
					className="min-w-0 rounded-lg border border-border bg-surface-raised p-4 lg:sticky lg:top-6"
				>
					<div className="mb-4 flex gap-2">
						<Button
							size="sm"
							variant={scope === 'active' ? 'primary' : 'secondary'}
							onClick={() => {
								setScope('active')
								setPage(1)
							}}
						>
							Блюда
						</Button>
						<Button
							size="sm"
							variant={scope === 'trash' ? 'primary' : 'secondary'}
							onClick={() => {
								setScope('trash')
								setPage(1)
							}}
						>
							Корзина
						</Button>
					</div>
					<form
						className="mb-4 flex gap-2"
						onSubmit={(event) => {
							event.preventDefault()
							setSearch(draft.trim())
							setPage(1)
						}}
					>
						<input
							className={`${catalogInput} !mt-0 min-w-0`}
							aria-label="Поиск блюда"
							type="search"
							maxLength={150}
							value={draft}
							onChange={(event) => setDraft(event.target.value)}
							placeholder="Название блюда"
						/>
						<Button size="sm" variant="secondary" type="submit">
							Найти
						</Button>
					</form>
					<div className="max-h-[55vh] space-y-3 overflow-y-auto lg:max-h-[60vh]">
						{query.isPending ? (
							<p role="status">Загрузка блюд…</p>
						) : query.isError ? (
							<div role="alert">
								<p>{managerError(query.error)}</p>
								<Button onClick={() => query.refetch()}>Повторить</Button>
							</div>
						) : (
							<>
								{query.data.items.map((dish) => {
									const selected =
										pathname === `${MANAGER_ROUTES.DISHES}/${dish.id}`
									return (
										<article
											key={dish.id}
											className={`rounded-md border ${selected ? 'border-accent bg-tint' : 'border-border bg-surface hover:border-accent'}`}
										>
											<Link
												href={`${MANAGER_ROUTES.DISHES}/${dish.id}`}
												aria-current={selected ? 'page' : undefined}
												aria-label={`Открыть рецепт: ${dish.name}`}
												className="block p-4"
											>
												<h2 className="break-words !text-title">{dish.name}</h2>
												<p className="mt-2 text-caption text-ink-muted">
													Ингредиентов: {dish.ingredients.length} · Версия{' '}
													{dish.version}
												</p>
												{dish.deletedAt ? (
													<p className="mt-2 text-caption text-ink-muted">
														В корзине с{' '}
														{new Date(dish.deletedAt).toLocaleString('ru-RU')}
													</p>
												) : (
													<>
														<p className="mt-2 font-semibold">
															Доступно порций: {dish.portions}
														</p>
														{dish.manualStop && (
															<p className="mt-2 text-caption text-ink-muted">
																Ручной стоп кухни
															</p>
														)}
													</>
												)}
											</Link>
											<div className="px-3 pb-3">
												<Button
													size="sm"
													variant="ghost"
													disabled={change.isPending}
													aria-label={`${dish.deletedAt ? 'Восстановить' : 'В корзину'}: ${dish.name}`}
													onClick={() =>
														setConfirmation({
															dish,
															action: dish.deletedAt ? 'restore' : 'trash'
														})
													}
												>
													{dish.deletedAt ? 'Восстановить' : 'В корзину'}
												</Button>
											</div>
										</article>
									)
								})}
								{!query.data.items.length && (
									<p className="p-4 text-center text-ink-muted">
										{scope === 'trash'
											? 'Корзина пуста'
											: 'Блюда не найдены. Создайте первое блюдо.'}
									</p>
								)}
							</>
						)}
					</div>
					{query.data && (
						<div className="mt-4 border-t border-border pt-3">
							<p className="mb-2 text-caption text-ink-muted">
								Страница {page} · Всего: {query.data.total}
							</p>
							<div className="flex justify-between gap-2">
								<Button
									size="sm"
									variant="ghost"
									disabled={page <= 1}
									onClick={() => setPage((value) => value - 1)}
								>
									Предыдущая
								</Button>
								<Button
									size="sm"
									variant="ghost"
									disabled={page * 25 >= query.data.total}
									onClick={() => setPage((value) => value + 1)}
								>
									Следующая
								</Button>
							</div>
						</div>
					)}
				</aside>
				<section aria-label="Панель рецепта" className="min-w-0">
					{children}
				</section>
			</div>
			<Modal
				isOpen={!!confirmation}
				onClose={() => {
					if (!change.isPending) setConfirmation(null)
				}}
			>
				<h2 className="pr-8 !text-title">
					{confirmation?.action === 'restore'
						? 'Восстановить блюдо?'
						: 'Переместить блюдо в корзину?'}
				</h2>
				<p className="mt-4 break-words text-ink-muted">
					«{confirmation?.dish.name}».{' '}
					{confirmation?.action === 'restore'
						? 'Блюдо вернётся в список. Доступность пересчитается по текущим остаткам.'
						: 'Сохранённый рецепт останется в корзине. Блюдо можно будет восстановить.'}
				</p>
				<div className="mt-6 flex gap-3">
					<Button
						disabled={change.isPending}
						onClick={() => confirmation && change.mutate(confirmation)}
					>
						{change.isPending ? 'Выполняем…' : 'Да'}
					</Button>
					<Button
						autoFocus
						variant="secondary"
						disabled={change.isPending}
						onClick={() => setConfirmation(null)}
					>
						Нет
					</Button>
				</div>
			</Modal>
		</DishesUserContext.Provider>
	)
}
export function DishesWorkspace({ children }: { children: ReactNode }) {
	return (
		<ManagerAccess>
			{(userId) => <Workspace userId={userId}>{children}</Workspace>}
		</ManagerAccess>
	)
}
