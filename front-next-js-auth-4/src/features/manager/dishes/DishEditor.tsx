'use client'
import { Button } from '@/components/ui/Button'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, type FormEvent } from 'react'
import toast from 'react-hot-toast'
import { managerApi, managerError } from '../api/manager.api'
import { managerKeys } from '../api/manager.keys'
import type { ManagerProduct } from '../api/manager.types'
import { useDishesUser } from './DishesContext'
import { MANAGER_ROUTES } from '../config/manager.routes'
import { catalogInput, catalogLabel } from '../products/styles'
import { dishesApi, dishKeys, type ManagerDish } from './dishes.api'
import { DishPhoto } from './DishPhoto'
import { useUnsavedChanges } from './useUnsavedChanges'

type Row = {
	productId: string
	name: string
	unit: { id: string; name: string }
	quantity: string
}
function Editor({
	dish: initialDish,
	userId,
	reload
}: {
	dish?: ManagerDish
	userId: string
	reload: () => void
}) {
	// Keep the version used to open this form until an explicit reload remounts it.
	const [dish] = useState(initialDish)
	const router = useRouter(),
		client = useQueryClient()
	const [name, setName] = useState(dish?.name ?? ''),
		[rows, setRows] = useState<Row[]>(dish?.ingredients ?? []),
		[searchDraft, setSearchDraft] = useState(''),
		[search, setSearch] = useState(''),
		[page, setPage] = useState(1),
		[error, setError] = useState(''),
		[highlight, setHighlight] = useState(''),
		[committed, setCommitted] = useState(false)
	const snapshot = (title: string, items: Row[]) =>
		JSON.stringify({
			name: title,
			ingredients: items.map((item) => ({
				productId: item.productId,
				quantity: item.quantity,
				unitId: item.unit.id
			}))
		})
	const dirty =
		!committed &&
		snapshot(name, rows) !== snapshot(dish?.name ?? '', dish?.ingredients ?? [])
	useUnsavedChanges(dirty)
	const [checkedName, setCheckedName] = useState('')
	useEffect(() => {
		const timer = setTimeout(
			() => setCheckedName(name.trim().replace(/\s+/g, ' ')),
			300
		)
		return () => clearTimeout(timer)
	}, [name])
	const duplicate = useQuery({
		queryKey: ['manager', 'dishes', userId, 'name', checkedName, dish?.id],
		queryFn: () => dishesApi.checkName(checkedName, dish?.id),
		enabled: !!checkedName && !dish?.deletedAt,
		retry: false
	})
	useEffect(() => {
		const timer = setTimeout(() => {
			setSearch(searchDraft.trim())
			setPage(1)
		}, 300)
		return () => clearTimeout(timer)
	}, [searchDraft])
	useEffect(() => {
		if (!highlight) return
		const timer = setTimeout(() => setHighlight(''), 2500)
		return () => clearTimeout(timer)
	}, [highlight])
	const filters = { search, unitId: '', page }
	const products = useQuery({
		queryKey: managerKeys.products(userId, filters),
		queryFn: () => managerApi.products(filters),
		retry: false,
		enabled: !dish?.deletedAt
	})
	const save = useMutation({
		mutationFn: () =>
			dishesApi.save(
				{
					name: name.trim(),
					ingredients: rows.map((item) => ({
						productId: item.productId,
						unitId: item.unit.id,
						quantity: item.quantity.trim().replace(',', '.')
					}))
				},
				dish
			),
		async onSuccess(result) {
			setCommitted(true)
			await Promise.all([
				client.invalidateQueries({ queryKey: dishKeys.all }),
				client.invalidateQueries({ queryKey: managerKeys.catalog })
			])
			toast.success('Рецепт сохранён')
			result.warnings.forEach((warning) => toast(warning, { duration: 6000 }))
			router.push(MANAGER_ROUTES.DISHES)
		},
		onError(error) {
			setError(managerError(error))
		}
	})
	const add = (product: ManagerProduct) => {
		if (rows.some((item) => item.productId === product.id)) {
			toast('Этот продукт уже есть. Вы можете просто увеличить количество.')
			setHighlight(product.id)
			const field = document.getElementById(`ingredient-${product.id}`)
			field?.focus()
			field?.scrollIntoView({ behavior: 'smooth', block: 'center' })
			return
		}
		setRows((current) => [
			...current,
			{
				productId: product.id,
				name: product.name,
				unit: product.unit,
				quantity: ''
			}
		])
	}
	const submit = (event: FormEvent) => {
		event.preventDefault()
		setError('')
		if (!name.trim()) {
			setError('Введите название блюда')
			return
		}
		if (!rows.length) {
			setError('Добавьте хотя бы один ингредиент')
			return
		}
		if (
			rows.some(
				(item) =>
					!/^\d{1,9}(\.\d{1,3})?$/.test(
						item.quantity.trim().replace(',', '.')
					) || Number(item.quantity.replace(',', '.')) <= 0
			)
		) {
			setError(
				'Количество каждого ингредиента должно быть положительным, до трёх дробных знаков'
			)
			return
		}
		save.mutate()
	}
	if (dish?.deletedAt)
		return (
			<>
				<h2 className="break-words">Открыть рецепт · {dish.name}</h2>
				<p className="my-4 text-ink-muted">
					Блюдо в корзине. Для редактирования восстановите его в списке.
				</p>
				<ul className="space-y-3">
					{dish.ingredients.map((item) => (
						<li
							key={item.productId}
							className="rounded-md border border-border bg-surface-raised p-4"
						>
							{item.name} — {item.quantity} {item.unit.name} на порцию
						</li>
					))}
				</ul>
			</>
		)
	const conflict =
		axios.isAxiosError(save.error) && save.error.response?.status === 409
	return (
		<>
			<h2>{dish ? 'Открыть рецепт' : 'Новое блюдо'}</h2>
			<p className="my-4 text-ink-muted">
				Все количества — на одну порцию. Остатки не ограничивают создание
				рецепта.
				{!dish && ' Фото для меню можно добавить после сохранения блюда.'}
			</p>
			{dish && <DishPhoto dish={dish} />}
			<form
				onSubmit={submit}
				className="space-y-5 rounded-lg border border-border bg-surface-raised p-5 sm:p-7"
			>
				<fieldset className="min-w-0 space-y-5" disabled={save.isPending}>
					<div>
						{!!duplicate.data?.matches && (
							<p role="status" className="mb-3 rounded-md bg-tint p-3">
								Блюдо с таким названием уже есть. Можно сохранить ещё одно.
							</p>
						)}
						<label className={catalogLabel} htmlFor="dish-name">
							Название блюда
						</label>
						<input
							id="dish-name"
							className={catalogInput}
							maxLength={150}
							required
							value={name}
							onChange={(event) => setName(event.target.value)}
						/>
					</div>
					<Link
						className="inline-flex rounded-md border border-border-strong px-4 py-3 text-accent"
						target="_blank"
						rel="noopener noreferrer"
						href={MANAGER_ROUTES.PRODUCTS}
					>
						Нет продукта в системе? Добавить продукт ↗
					</Link>
					<div>
						<label className={catalogLabel} htmlFor="dish-product-search">
							Найти ингредиент
						</label>
						<input
							id="dish-product-search"
							className={catalogInput}
							type="search"
							maxLength={150}
							value={searchDraft}
							onChange={(event) => setSearchDraft(event.target.value)}
							placeholder="Продукт из справочника"
						/>
						{products.isPending ? (
							<p role="status">Загрузка продуктов…</p>
						) : products.isError ? (
							<p role="alert">
								{managerError(products.error)}{' '}
								<button
									type="button"
									className="underline"
									onClick={() => products.refetch()}
								>
									Повторить
								</button>
							</p>
						) : (
							<>
								<div className="mt-3 flex max-h-48 flex-wrap gap-2 overflow-y-auto">
									{products.data?.items.map((product) => (
										<Button
											type="button"
											size="sm"
											variant="secondary"
											key={product.id}
											className="max-w-full !whitespace-normal !text-left"
											disabled={
												rows.length >= 100 &&
												!rows.some((item) => item.productId === product.id)
											}
											onClick={() => add(product)}
										>
											+ {product.name} · {product.unit.name}
										</Button>
									))}
								</div>
								{!products.data?.items.length && (
									<p className="mt-3 text-ink-muted">Продукты не найдены.</p>
								)}
								<div className="mt-3 flex gap-3">
									<Button
										type="button"
										variant="ghost"
										disabled={page <= 1}
										onClick={() => setPage((value) => value - 1)}
									>
										Назад
									</Button>
									<Button
										type="button"
										variant="ghost"
										disabled={page * 25 >= (products.data?.total ?? 0)}
										onClick={() => setPage((value) => value + 1)}
									>
										Далее
									</Button>
								</div>
							</>
						)}
					</div>
					<div className="space-y-3">
						{rows.map((item) => (
							<div
								key={item.productId}
								className={`grid items-end gap-3 rounded-md border p-4 sm:grid-cols-[minmax(0,1fr)_180px_auto] ${highlight === item.productId ? 'border-accent bg-tint ring-2 ring-accent' : 'border-border bg-surface'}`}
							>
								<div className="min-w-0">
									<b className="break-words">{item.name}</b>
									<p className="text-caption text-ink-muted">
										Единица: {item.unit.name}
									</p>
								</div>
								<div>
									<label
										className={catalogLabel}
										htmlFor={`ingredient-${item.productId}`}
									>
										Количество на порцию
									</label>
									<input
										id={`ingredient-${item.productId}`}
										className={catalogInput}
										required
										maxLength={13}
										inputMode="decimal"
										value={item.quantity}
										onChange={(event) =>
											setRows((current) =>
												current.map((row) =>
													row.productId === item.productId
														? { ...row, quantity: event.target.value }
														: row
												)
											)
										}
									/>
								</div>
								<Button
									type="button"
									variant="ghost"
									aria-label={`Убрать ${item.name}`}
									onClick={() =>
										setRows((current) =>
											current.filter((row) => row.productId !== item.productId)
										)
									}
								>
									Убрать
								</Button>
							</div>
						))}
					</div>
					{dish && (
						<div className="rounded-md bg-surface p-4 text-caption text-ink-muted">
							Сохранённый рецепт: версия {dish.version}, доступно порций{' '}
							{dish.portions}.
							{dish.ingredients.some((item) => item.missing) && (
								<p className="mt-2">
									Не хватает на порцию:{' '}
									{dish.ingredients
										.filter((item) => item.missing)
										.map((item) => item.name)
										.join(', ')}
									.
								</p>
							)}
							{dish.manualStop && (
								<p className="mt-2">Ручной стоп кухни сохранится.</p>
							)}
						</div>
					)}
				</fieldset>
				{error && (
					<div
						role="alert"
						className="rounded-md bg-danger-tint p-4 text-danger"
					>
						<p>{error}</p>
						{conflict && (
							<Button
								type="button"
								variant="secondary"
								className="mt-3"
								onClick={() => {
									if (
										!dirty ||
										window.confirm(
											'Загрузить свежий рецепт? Введённые изменения будут заменены.'
										)
									)
										reload()
								}}
							>
								Загрузить актуальную версию
							</Button>
						)}
					</div>
				)}
				<Button type="submit" disabled={save.isPending}>
					{save.isPending ? 'Сохраняем…' : 'Сохранить рецепт'}
				</Button>
				<p className="text-caption text-ink-muted">
					Изменения попадут в базу только после сохранения. Количество партий на
					складе не меняется.
				</p>
			</form>
		</>
	)
}
function Loaded({ id, userId }: { id: string; userId: string }) {
	const query = useQuery({
		queryKey: dishKeys.detail(userId, id),
		queryFn: () => dishesApi.get(id),
		enabled: id !== 'new',
		retry: false,
		refetchOnWindowFocus: false,
		staleTime: Infinity,
		gcTime: 0
	})
	const [revision, setRevision] = useState(0)
	if (id === 'new') return <Editor userId={userId} reload={() => {}} />
	if (query.isPending) return <p role="status">Загрузка рецепта…</p>
	if (query.isError)
		return (
			<div role="alert">
				<p>{managerError(query.error)}</p>
				<Button onClick={() => query.refetch()}>Повторить</Button>
			</div>
		)
	return (
		<Editor
			key={`${id}-${revision}`}
			dish={query.data}
			userId={userId}
			reload={() => {
				query.refetch().then((result) => {
					if (result.data) setRevision((value) => value + 1)
				})
			}}
		/>
	)
}
export function DishEditorPage({ id }: { id: string }) {
	const userId = useDishesUser()
	return <Loaded key={id} id={id} userId={userId} />
}
