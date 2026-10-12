'use client'
import { Button } from '@/components/ui/Button'
import { Loading } from '@/components/ui/PizzaLoader'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'
import { ManagerAccess } from '../components/ManagerAccess'
import { MANAGER_ROUTES } from '../config/manager.routes'
import { managerError } from '../api/manager.api'
import { catalogInput } from '../products/styles'
import { warehouseApi, warehouseDate, warehouseKeys } from './warehouse.api'
import { WarehouseSignals } from './WarehouseSignals'
import { ProductsTable } from './ProductsTable'

function Workspace({ userId }: { userId: string }) {
	const [draft, setDraft] = useState(''),
		[search, setSearch] = useState(''),
		[expiringOnly, setExpiringOnly] = useState(false),
		[page, setPage] = useState(1)
	const filters = { search, expiringOnly, page }
	const products = useQuery({
		queryKey: warehouseKeys.products(userId, filters),
		queryFn: () => warehouseApi.products(filters),
		retry: false,
		refetchInterval: 15000,
		refetchOnWindowFocus: true
	})
	const signals = useQuery({
		queryKey: warehouseKeys.signals(userId),
		queryFn: warehouseApi.signals,
		retry: false,
		refetchInterval: 15000,
		refetchOnWindowFocus: true
	})
	return (
		<>
			<div className="mb-6 flex flex-wrap items-start justify-between gap-4">
				<div>
					<h1>
						Склад и <span className="title-accent">сроки годности</span>
					</h1>
					<p className="mt-3 text-ink-muted">
						Остатки по продуктам и партиям. Обновление каждые 15 секунд.
					</p>
				</div>
				<div className="flex flex-wrap gap-3">
					<Button
						variant="secondary"
						onClick={() => {
							products.refetch()
							signals.refetch()
						}}
					>
						Обновить
					</Button>
					<Link
						className="rounded-md bg-accent px-4 py-3 font-semibold text-on-accent"
						href={MANAGER_ROUTES.DELIVERIES}
					>
						+ Принять поставку
					</Link>
				</div>
			</div>
			{signals.isPending ? (
				<Loading label="Загрузка сигналов склада…" className="mb-6" />
			) : signals.isError ? (
				<div role="alert" className="mb-6 rounded-md bg-danger-tint p-4">
					<p>{managerError(signals.error)}</p>
					<Button variant="secondary" onClick={() => signals.refetch()}>
						Повторить сигналы
					</Button>
				</div>
			) : (
				<WarehouseSignals data={signals.data} />
			)}
			<form
				className="mb-5 flex flex-wrap items-end gap-4"
				onSubmit={(event) => {
					event.preventDefault()
					setSearch(draft.trim())
					setPage(1)
				}}
			>
				<div className="min-w-0 flex-1">
					<label
						className="text-caption font-semibold"
						htmlFor="warehouse-search"
					>
						Поиск продукта
					</label>
					<input
						id="warehouse-search"
						className={catalogInput}
						type="search"
						maxLength={150}
						placeholder="Название"
						value={draft}
						onChange={(event) => setDraft(event.target.value)}
					/>
				</div>
				<Button type="submit" variant="secondary">
					Найти
				</Button>
				<label className="flex min-h-11 cursor-pointer items-center gap-2 text-caption">
					<input
						type="checkbox"
						className="size-5 accent-accent"
						checked={expiringOnly}
						onChange={(event) => {
							setExpiringOnly(event.target.checked)
							setPage(1)
						}}
					/>
					Только с истекающими партиями
				</label>
			</form>
			{products.isPending ? (
				<Loading label="Загрузка продуктов склада…" />
			) : products.isError ? (
				<div role="alert">
					<p>{managerError(products.error)}</p>
					<Button variant="secondary" onClick={() => products.refetch()}>
						Повторить
					</Button>
				</div>
			) : (
				<ProductsTable
					key={`${search}-${expiringOnly}`}
					data={products.data}
					userId={userId}
					page={page}
					setPage={setPage}
				/>
			)}
			<p className="mt-5 text-caption text-ink-muted">
				Раскройте продукт, чтобы посмотреть партии. Годные партии идут по FEFO;
				просроченные показаны отдельно. Даты отображаются в часовом поясе
				устройства.
			</p>
			{products.data && (
				<p className="mt-2 text-caption text-ink-muted" role="status">
					{products.isFetching
						? 'Обновляем остатки…'
						: `Данные на ${warehouseDate(products.data.generatedAt)}`}
				</p>
			)}
		</>
	)
}
export function WarehouseWorkspace() {
	return (
		<ManagerAccess>{(userId) => <Workspace userId={userId} />}</ManagerAccess>
	)
}
