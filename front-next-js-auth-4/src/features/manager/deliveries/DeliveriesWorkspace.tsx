'use client'

import { serverNow } from '@/api/server-clock'
import { Button } from '@/components/ui/Button'
import { Loading } from '@/components/ui/PizzaLoader'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, type FormEvent } from 'react'
import toast from 'react-hot-toast'
import { managerApi, managerError } from '../api/manager.api'
import { managerKeys } from '../api/manager.keys'
import type { ManagerProduct } from '../api/manager.types'
import { ManagerAccess } from '../components/ManagerAccess'
import { MANAGER_ROUTES } from '../config/manager.routes'
import { catalogInput, catalogLabel } from '../products/styles'
import {
	deliveriesApi,
	deliveryKeys,
	receiptDate,
	type DeliveryInput
} from './deliveries.api'

type DraftLine = {
	key: string
	product: ManagerProduct
	quantity: string
	expiresAt: string
}

function Workspace({ userId }: { userId: string }) {
	const client = useQueryClient(),
		router = useRouter()
	const [supplierId, setSupplierId] = useState(''),
		[supplierName, setSupplierName] = useState(''),
		[number, setNumber] = useState('')
	const [receivedAt, setReceivedAt] = useState('')
	const [lines, setLines] = useState<DraftLine[]>([]),
		[review, setReview] = useState(false),
		[error, setError] = useState('')
	const [pending, setPending] = useState<DeliveryInput | null>(null)
	const [productSearch, setProductSearch] = useState(''),
		[search, setSearch] = useState(''),
		[productPage, setProductPage] = useState(1)
	const [historyDraft, setHistoryDraft] = useState(''),
		[historySearch, setHistorySearch] = useState(''),
		[page, setPage] = useState(1)
	useEffect(() => {
		const timer = setTimeout(() => {
			setSearch(productSearch.trim())
			setProductPage(1)
		}, 300)
		return () => clearTimeout(timer)
	}, [productSearch])
	const suppliers = useQuery({
		queryKey: deliveryKeys.suppliers(userId),
		queryFn: deliveriesApi.suppliers,
		retry: false
	})
	const filters = { search, unitId: '', page: productPage }
	const products = useQuery({
		queryKey: managerKeys.products(userId, filters),
		queryFn: () => managerApi.products(filters),
		retry: false
	})
	const history = useQuery({
		queryKey: deliveryKeys.list(userId, historySearch, page),
		queryFn: () => deliveriesApi.list(historySearch, page),
		retry: false
	})
	const addSupplier = useMutation({
		mutationFn: deliveriesApi.createSupplier,
		async onSuccess(supplier) {
			await client.invalidateQueries({
				queryKey: deliveryKeys.suppliers(userId)
			})
			setSupplierId(supplier.id)
			setSupplierName('')
			toast.success('Поставщик добавлен')
		}
	})
	const receive = useMutation({
		mutationFn: deliveriesApi.receive,
		async onSuccess(delivery) {
			await Promise.all([
				client.invalidateQueries({ queryKey: deliveryKeys.all }),
				client.invalidateQueries({ queryKey: managerKeys.catalog })
			])
			setPending(null)
			setLines([])
			setReview(false)
			setNumber('')
			setReceivedAt('')
			setError('')
			toast.success('Поставка принята')
			router.push(`${MANAGER_ROUTES.DELIVERIES}/${delivery.id}`)
		},
		onError(e) {
			const status = axios.isAxiosError(e) ? e.response?.status : undefined
			if (status && status < 500) setPending(null)
			setError(managerError(e))
		}
	})
	const locked = receive.isPending || !!pending
	const updateLine = (key: string, patch: Partial<DraftLine>) =>
		setLines((current) =>
			current.map((line) => (line.key === key ? { ...line, ...patch } : line))
		)
	const validate = () => {
		if (!supplierId || !number.trim())
			return 'Выберите поставщика и укажите номер накладной'
		if (!lines.length) return 'Добавьте хотя бы один продукт'
		if (
			receivedAt &&
			(!Number.isFinite(new Date(receivedAt).getTime()) ||
				new Date(receivedAt).getTime() > serverNow())
		)
			return 'Укажите дату приёма не позднее текущего времени'
		for (const [index, line] of lines.entries()) {
			const quantity = line.quantity.trim().replace(',', '.')
			if (!/^\d{1,9}(\.\d{1,3})?$/.test(quantity) || Number(quantity) <= 0)
				return `Строка ${index + 1}: введите положительное количество, не более 3 знаков после запятой`
			if (
				!line.expiresAt ||
				!Number.isFinite(new Date(line.expiresAt).getTime()) ||
				new Date(line.expiresAt).getTime() <= serverNow()
			)
				return `Строка ${index + 1}: укажите будущие дату и время годности`
		}
		return ''
	}
	const submit = (e: FormEvent) => {
		e.preventDefault()
		const issue = validate()
		setError(issue)
		if (!issue) setReview(true)
	}
	const confirm = () => {
		if (pending) {
			receive.mutate(pending)
			return
		}
		const issue = validate()
		setError(issue)
		if (issue) {
			setReview(false)
			return
		}
		const input = {
			requestId: crypto.randomUUID(),
			supplierId,
			number: number.trim().replace(/\s+/g, ' '),
			...(receivedAt ? { receivedAt: new Date(receivedAt).toISOString() } : {}),
			lines: lines.map((line) => ({
				productId: line.product.id,
				unitId: line.product.unit.id,
				quantity: line.quantity.trim().replace(',', '.'),
				expiresAt: new Date(line.expiresAt).toISOString()
			}))
		}
		setPending(input)
		receive.mutate(input)
	}
	return (
		<>
			<div className="mb-7">
				<p className="mb-3 text-caption font-bold tracking-[0.1em] uppercase text-gold-ink">Приём на склад</p>
				<h1>Поставки</h1>
				<p className="mt-3 text-ink-muted">
					Одна накладная — несколько продуктов и партий. Остатки обновятся после
					подтверждения.
				</p>
			</div>
			<section
				className="rounded-lg border border-border bg-surface-raised p-5 sm:p-7"
				aria-label="Приём поставки"
			>
				<h2>
					Новая <span className="title-accent">поставка</span>
				</h2>
				<form onSubmit={submit} className="mt-5 space-y-5">
					<fieldset
						disabled={locked || review}
						className="min-w-0 space-y-5 disabled:opacity-70"
					>
						<div className="grid gap-4 sm:grid-cols-2">
							<div>
								<label htmlFor="receipt-supplier" className={catalogLabel}>
									Поставщик
								</label>
								<select
									id="receipt-supplier"
									className={catalogInput}
									required
									value={supplierId}
									onChange={(e) => setSupplierId(e.target.value)}
								>
									<option value="">Выберите поставщика</option>
									{suppliers.data?.map((supplier) => (
										<option key={supplier.id} value={supplier.id}>
											{supplier.name}
										</option>
									))}
								</select>
							</div>
							<div>
								<label htmlFor="receipt-number" className={catalogLabel}>
									Номер накладной
								</label>
								<input
									id="receipt-number"
									className={catalogInput}
									maxLength={100}
									required
									value={number}
									onChange={(e) => setNumber(e.target.value)}
									placeholder="Например, П-1042"
								/>
							</div>
						</div>
						{suppliers.isError && (
							<p role="alert">
								{managerError(suppliers.error)}{' '}
								<button
									type="button"
									className="underline"
									onClick={() => suppliers.refetch()}
								>
									Повторить
								</button>
							</p>
						)}
						<div className="max-w-md">
							<label htmlFor="receipt-date" className={catalogLabel}>
								Дата и время приёма (необязательно)
							</label>
							<input
								id="receipt-date"
								type="datetime-local"
								className={catalogInput}
								value={receivedAt}
								onChange={(e) => setReceivedAt(e.target.value)}
							/>
							<p className="mt-2 text-caption text-ink-muted">
								Оставьте пустым, чтобы использовать время подтверждения. Можно
								указать фактическую дату приёма в прошлом.
							</p>
						</div>
						<Link
							href={MANAGER_ROUTES.PRODUCTS}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex min-h-11 items-center rounded-full border border-border-strong px-5 py-2 font-semibold text-ink hover:bg-tint"
						>
							Нет продукта в системе? Добавить продукт ↗
						</Link>
						<p className="text-caption text-ink-muted">
							Добавьте продукт и вернитесь сюда — форма поставки сохранится.
						</p>
						<details className="rounded-md border border-border p-4">
							<summary className="cursor-pointer font-bold text-fire-ink">
								Добавить поставщика
							</summary>
							<label
								htmlFor="supplier-name"
								className={`${catalogLabel} mt-3 block`}
							>
								Название поставщика
							</label>
							<div className="flex flex-wrap items-end gap-3">
								<input
									id="supplier-name"
									className={`${catalogInput} sm:!w-80`}
									value={supplierName}
									onChange={(e) => setSupplierName(e.target.value)}
									maxLength={150}
								/>
								<Button
									type="button"
									variant="secondary"
									disabled={addSupplier.isPending || !supplierName.trim()}
									onClick={() => addSupplier.mutate(supplierName.trim())}
								>
									Добавить поставщика
								</Button>
							</div>
							{addSupplier.isError && (
								<p role="alert" className="mt-3 text-danger">
									{managerError(addSupplier.error)}
								</p>
							)}
						</details>
						<div>
							<label className={catalogLabel} htmlFor="receipt-product-search">
								Найти продукт для поставки
							</label>
							<input
								id="receipt-product-search"
								className={catalogInput}
								type="search"
								maxLength={150}
								placeholder="Введите название продукта"
								value={productSearch}
								onChange={(e) => setProductSearch(e.target.value)}
							/>
							{products.isPending ? (
								<Loading size={32} label="Загрузка продуктов…" className="py-4" />
							) : products.isError ? (
								<p role="alert">
									{managerError(products.error)}{' '}
									<button
										type="button"
										onClick={() => products.refetch()}
										className="underline"
									>
										Повторить
									</button>
								</p>
							) : (
								<>
									<div className="mt-3 flex max-h-48 flex-wrap gap-2 overflow-y-auto">
										{products.data?.items.map((product) => (
											<Button
												key={product.id}
												type="button"
												variant="secondary"
												size="sm"
												disabled={lines.length >= 100}
												className="max-w-full !whitespace-normal !text-left"
												onClick={() =>
													setLines((current) => [
														...current,
														{
															key: crypto.randomUUID(),
															product,
															quantity: '',
															expiresAt: ''
														}
													])
												}
											>
												+ {product.name} · {product.unit.name}
											</Button>
										))}
									</div>
									{!products.data?.items.length && (
										<p className="mt-3 text-ink-muted">
											Продукты не найдены.{' '}
											<Link
												className="font-semibold text-gold-ink underline"
												href={MANAGER_ROUTES.PRODUCTS}
											>
												Открыть справочник
											</Link>
										</p>
									)}
									<div className="mt-3 flex gap-3">
										<Button
											size="sm"
											type="button"
											variant="ghost"
											disabled={productPage <= 1}
											onClick={() => setProductPage((value) => value - 1)}
										>
											Назад
										</Button>
										<Button
											size="sm"
											type="button"
											variant="ghost"
											disabled={productPage * 25 >= (products.data?.total ?? 0)}
											onClick={() => setProductPage((value) => value + 1)}
										>
											Далее
										</Button>
									</div>
								</>
							)}
						</div>
						<div className="space-y-3">
							{lines.map((line, index) => (
								<div
									key={line.key}
									className="grid items-end gap-3 rounded-md border border-border bg-surface p-4 lg:grid-cols-[minmax(0,1fr)_180px_240px_auto]"
								>
									<div className="min-w-0">
										<b className="break-words">
											{index + 1}. {line.product.name}
										</b>
										<p className="text-caption text-ink-muted">
											Единица: {line.product.unit.name}
										</p>
									</div>
									<div>
										<label
											className={catalogLabel}
											htmlFor={`quantity-${line.key}`}
										>
											Количество · строка {index + 1}
										</label>
										<input
											id={`quantity-${line.key}`}
											className={catalogInput}
											inputMode="decimal"
											required
											maxLength={13}
											value={line.quantity}
											onChange={(e) =>
												updateLine(line.key, { quantity: e.target.value })
											}
											placeholder="0,000"
										/>
									</div>
									<div className="min-w-0">
										<label
											className={catalogLabel}
											htmlFor={`expiry-${line.key}`}
										>
											Годен до · строка {index + 1}
										</label>
										<input
											id={`expiry-${line.key}`}
											type="datetime-local"
											required
											className={`${catalogInput} min-w-0`}
											value={line.expiresAt}
											onChange={(e) =>
												updateLine(line.key, { expiresAt: e.target.value })
											}
										/>
									</div>
									<Button
										type="button"
										variant="ghost"
										aria-label={`Убрать строку ${index + 1}`}
										onClick={() =>
											setLines((current) =>
												current.filter((item) => item.key !== line.key)
											)
										}
									>
										Убрать
									</Button>
								</div>
							))}
						</div>
						<p className="text-caption text-ink-muted">
							Для разных сроков годности добавьте продукт повторно.
							Просроченные позиции принять нельзя.
						</p>
					</fieldset>
					{error && (
						<p
							role="alert"
							className="rounded-md bg-danger-tint p-3 text-danger"
						>
							{error}
						</p>
					)}
					{!review && (
						<Button
							type="submit"
							disabled={locked || !lines.length || addSupplier.isPending}
						>
							Проверить поставку
						</Button>
					)}
					{review && (
						<div className="rounded-md border border-border bg-tint p-5">
							<h3 className="font-semibold">Подтвердить приём?</h3>
							<p className="my-3 break-words">
								Поставщик:{' '}
								{suppliers.data?.find((item) => item.id === supplierId)?.name}.
								Накладная № {number}. Партий: {lines.length}. Проведённую
								поставку нельзя изменить или удалить.
							</p>
							<p className="mb-3">
								Дата приёма:{' '}
								{receivedAt
									? receiptDate(new Date(receivedAt).toISOString())
									: 'автоматически при подтверждении'}
							</p>
							{pending && !receive.isPending && (
								<p className="mb-3" role="status">
									Результат запроса пока неизвестен. Повторите подтверждение:
									повторный запрос не создаст вторую поставку.
								</p>
							)}
							<div className="flex flex-wrap gap-3">
								<Button
									type="button"
									disabled={receive.isPending}
									onClick={confirm}
								>
									{receive.isPending
										? 'Принимаем…'
										: pending
											? 'Повторить подтверждение'
											: 'Подтвердить приём'}
								</Button>
								<Button
									type="button"
									variant="secondary"
									disabled={locked}
									onClick={() => setReview(false)}
								>
									Вернуться к форме
								</Button>
							</div>
						</div>
					)}
				</form>
			</section>
			<section className="mt-8" aria-label="Журнал поставок">
				<h2>Проведённые поставки</h2>
				<form
					className="my-4 flex flex-wrap items-end gap-3"
					onSubmit={(e) => {
						e.preventDefault()
						setHistorySearch(historyDraft.trim())
						setPage(1)
					}}
				>
					<div className="flex-1">
						<label htmlFor="receipt-history-search" className={catalogLabel}>
							Поиск по накладной или поставщику
						</label>
						<input
							id="receipt-history-search"
							className={catalogInput}
							value={historyDraft}
							onChange={(e) => setHistoryDraft(e.target.value)}
							maxLength={150}
							type="search"
						/>
					</div>
					<Button type="submit" variant="secondary">
						Найти
					</Button>
				</form>
				{history.isPending ? (
					<Loading label="Загрузка поставок…" />
				) : history.isError ? (
					<div role="alert">
						<p>{managerError(history.error)}</p>
						<Button onClick={() => history.refetch()}>Повторить</Button>
					</div>
				) : (
					<>
						<div className="space-y-3">
							{history.data?.items.map((item) => (
								<Link
									key={item.id}
									href={`${MANAGER_ROUTES.DELIVERIES}/${item.id}`}
									className="block rounded-lg border border-border bg-surface-raised p-5 hover:border-accent"
								>
									<b className="break-words">
										№ {item.number} ·{' '}
										{item.supplier?.name ?? 'Поставщик не указан'}
									</b>
									<p className="mt-2 text-caption text-ink-muted">
										{receiptDate(item.createDate)} · {item.creater.name} ·
										Партий: {item._count.batches}
									</p>
								</Link>
							))}
							{!history.data?.items.length && (
								<p className="text-ink-muted">Поставки не найдены.</p>
							)}
						</div>
						<div className="mt-4 flex flex-wrap items-center gap-3">
							<Button
								variant="ghost"
								disabled={page <= 1}
								onClick={() => setPage((value) => value - 1)}
							>
								Предыдущая
							</Button>
							<span>
								Страница {page} · Всего: {history.data?.total ?? 0}
							</span>
							<Button
								variant="ghost"
								disabled={page * 25 >= (history.data?.total ?? 0)}
								onClick={() => setPage((value) => value + 1)}
							>
								Следующая
							</Button>
						</div>
					</>
				)}
			</section>
		</>
	)
}
export function DeliveriesWorkspace() {
	return (
		<ManagerAccess>{(userId) => <Workspace userId={userId} />}</ManagerAccess>
	)
}
