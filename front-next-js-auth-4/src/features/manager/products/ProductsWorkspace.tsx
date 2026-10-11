'use client'

import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { PUBLIC_PAGES } from '@/config/pages/public.config'
import authService from '@/services/auth/auth.service'
import userService from '@/services/user.service'
import { UserRole } from '@/types/auth.types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { TbArrowLeft, TbArrowRight, TbPackage, TbPencil, TbSearch, TbTrash } from 'react-icons/tb'
import { managerApi, managerError } from '../api/manager.api'
import { managerKeys } from '../api/manager.keys'
import type { ManagerProduct } from '../api/manager.types'
import { ProductEditor } from './ProductEditor'
import { catalogInput } from './styles'

const formatQuantity = (quantity: string) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(Number(quantity))

export function ProductsWorkspace() {
	const client = useQueryClient()
	const router = useRouter()
	const pathname = usePathname()
	const params = useSearchParams()
	const search = params.get('search')?.slice(0, 150) ?? ''
	const unitId = params.get('unitId') ?? ''
	const rawPage = Number(params.get('page') ?? 1)
	const page = Number.isInteger(rawPage) && rawPage >= 1 && rawPage <= 1000000 ? rawPage : 1
	const [searchDraft, setSearchDraft] = useState(search)
	const [selected, setSelected] = useState<ManagerProduct | null>(null)
	const [editorRevision, setEditorRevision] = useState(0)
	const [deleting, setDeleting] = useState<ManagerProduct | null>(null)
	const [deleteError, setDeleteError] = useState('')

	const session = useQuery({
		queryKey: managerKeys.session,
		queryFn: async () => (await userService.fetchProfile()).data,
		retry: false,
		gcTime: 0,
		staleTime: 0,
		refetchOnMount: 'always'
	})
	const allowed = session.data?.role === UserRole.MANAGER && !session.isError
	const userId = session.data?.id ?? ''
	const filters = { search, unitId, page }
	const units = useQuery({ queryKey: managerKeys.units(userId), queryFn: managerApi.units, enabled: allowed, retry: false })
	const products = useQuery({ queryKey: managerKeys.products(userId, filters), queryFn: () => managerApi.products(filters), enabled: allowed, retry: false })
	const changeFilters = useCallback((updates: Record<string, string>) => {
		const next = new URLSearchParams(params.toString())
		Object.entries(updates).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key))
		router.replace(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false })
	}, [params, pathname, router])
	useEffect(() => setSearchDraft(search), [search])
	useEffect(() => {
		if (searchDraft === search) return
		const timer = setTimeout(() => changeFilters({ search: searchDraft.trim(), page: '' }), 300)
		return () => clearTimeout(timer)
	}, [searchDraft, search, changeFilters])

	const resetEditor = () => { setSelected(null); setEditorRevision(value => value + 1) }
	const remove = useMutation({
		mutationFn: managerApi.deleteProduct,
		async onSuccess(_, id) {
			setDeleting(null); setDeleteError('')
			if (selected?.id === id) resetEditor()
			await client.invalidateQueries({ queryKey: managerKeys.catalog })
			if (products.data?.items.length === 1 && page > 1) changeFilters({ page: String(page - 1) })
			toast.success('Продукт удалён')
		},
		onError: error => setDeleteError(managerError(error))
	})
	const logout = useMutation({
		mutationFn: () => authService.logout(),
		async onSuccess() {
			client.removeQueries({ queryKey: managerKeys.catalog })
			await client.resetQueries({ queryKey: managerKeys.session })
		},
		onError: error => toast.error(managerError(error))
	})

	if (session.isPending) return <p role="status" className="py-10 text-ink-muted">Загрузка справочника…</p>
	if (!allowed) {
		const unauthorized = axios.isAxiosError(session.error) && session.error.response?.status === 401
		return <section className="mx-auto max-w-lg rounded-lg border border-border bg-surface-raised p-8 shadow-card">
			<TbPackage className="mb-4 text-gold" size={32} aria-hidden />
			<h1 className="!text-2xl">{session.data ? 'Доступ только для менеджера' : unauthorized ? 'Войдите как менеджер' : 'Не удалось открыть справочник'}</h1>
			<p className="mt-3 text-ink-muted">{session.data ? 'У текущей учётной записи другая роль. Продукты доступны только сотруднику с ролью «Менеджер».' : managerError(session.error)}</p>
			<div className="mt-6 flex flex-wrap items-center gap-3">
				{session.data ? <Button variant="secondary" onClick={() => logout.mutate()} disabled={logout.isPending}>Выйти из текущей учётной записи</Button> : <Link className="rounded-md bg-accent px-4 py-3 font-semibold text-on-accent" href={PUBLIC_PAGES.LOGIN}>Перейти ко входу</Link>}
				<Button variant="ghost" onClick={() => session.refetch()}>Проверить доступ</Button>
			</div>
		</section>
	}

	const data = products.data
	const pages = Math.max(1, Math.ceil((data?.total ?? 0) / 25))
	return (
		<>
			<div className="mb-7 flex flex-wrap items-start justify-between gap-4">
				<div><div className="mb-3 text-caption font-bold tracking-[0.1em] uppercase text-gold-ink">Справочник склада</div><h1>Продукты</h1><p className="mt-2 max-w-xl text-ink-muted">Остатки поступают со склада.</p></div>
			</div>
			<div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
				<section aria-label="Список продуктов" className="min-w-0">
					<div className="mb-4 flex flex-col gap-3 sm:flex-row">
						<div className="relative flex-1"><TbSearch className="pointer-events-none absolute left-3 top-3.5 text-ink-muted" size={20} aria-hidden /><input aria-label="Поиск продукта" className={`${catalogInput} !mt-0 !pl-10`} placeholder="Найти продукт" value={searchDraft} onChange={e => setSearchDraft(e.target.value)} maxLength={150} type="search" /></div>
						<select aria-label="Фильтр по единице" value={unitId} onChange={e => changeFilters({ unitId: e.target.value, page: '' })} className={`${catalogInput} !mt-0 sm:!w-40`}><option value="">Все единицы</option>{units.data?.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select>
					</div>
					{units.isError && <div role="alert" className="mb-4 rounded-md bg-danger-tint p-3 text-caption text-danger">Не удалось загрузить единицы. <button className="underline" onClick={() => units.refetch()}>Повторить</button></div>}
					<div className="overflow-hidden rounded-lg border border-border bg-surface-raised shadow-card">
						<div className="flex items-center justify-between border-b border-border px-5 py-3 text-caption"><b>Каталог {data && <span className="ml-2 rounded-sm bg-tint px-2 py-0.5 text-accent">{data.total}</span>}</b><span role="status" className="text-ink-muted">{products.isFetching ? 'Обновляем…' : 'Годный остаток'}</span></div>
						{products.isPending ? <div role="status" className="px-5 py-12 text-center text-ink-muted">Загрузка продуктов…</div>
							: products.isError ? <div role="alert" className="p-6"><p className="text-danger">{managerError(products.error)}</p><Button variant="secondary" className="mt-3" onClick={() => products.refetch()}>Повторить</Button></div>
								: !data?.items.length ? <div className="px-6 py-14 text-center"><TbPackage className="mx-auto mb-4 text-gold" size={40} aria-hidden /><h2 className="!text-title">{search || unitId ? 'Ничего не найдено' : page > 1 ? 'На этой странице нет продуктов' : 'Добавьте первый продукт'}</h2><p className="mx-auto mt-2 max-w-sm text-caption text-ink-muted">{search || unitId ? 'Измените запрос или сбросьте фильтры.' : 'Создайте единицу измерения и продукт в форме рядом. Количество появится после поставки.'}</p>{(search || unitId || page > 1) && <Button variant="ghost" className="mt-3" onClick={() => { setSearchDraft(''); changeFilters({ search: '', unitId: '', page: '' }) }}>Показать все продукты</Button>}</div>
									: <div className="relative overflow-x-auto"><table className="w-full min-w-[570px] text-left text-caption"><thead className="border-b border-border bg-surface text-ink-muted"><tr><th className="px-5 py-3">Продукт</th><th className="px-3 py-3">Ед.</th><th className="px-3 py-3 text-right">Остаток</th><th className="px-3 py-3 text-right">В блюдах</th><th className="px-4 py-3"><span className="sr-only">Действия</span></th></tr></thead>
										<tbody>{data.items.map(product => <tr key={product.id} className={`border-b border-border last:border-0 ${selected?.id === product.id ? 'bg-tint' : 'hover:bg-surface'}`}><td className="px-5 py-4"><span className="break-words font-semibold text-ink">{product.name}</span>{product.batchesCount > 0 && <span className="mt-1 block text-ink-muted">Партий: {product.batchesCount}</span>}</td><td className="px-3 py-4 text-ink-muted">{product.unit.name}</td><td className="px-3 py-4 text-right font-mono tabular-nums">{formatQuantity(product.availableQuantity)}</td><td className="px-3 py-4 text-right text-ink-muted">{product.dishesCount || '—'}</td><td className="px-4 py-3"><div className="flex justify-end gap-1">
											<Button variant="ghost" size="sm" aria-label={`Изменить ${product.name}`} title="Изменить продукт" onClick={() => { setSelected(product); setEditorRevision(n => n + 1); document.getElementById('product-editor')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }}><TbPencil size={19} aria-hidden /></Button>
											<span title={product.canDelete ? 'Удалить продукт' : 'Нельзя удалить: есть партии или использование в рецептах'}><Button variant="ghost" size="sm" aria-label={`Удалить ${product.name}`} disabled={!product.canDelete} onClick={() => { setDeleting(product); setDeleteError('') }}><TbTrash size={18} aria-hidden /></Button></span>
										</div></td></tr>)}</tbody></table></div>}
						{data && (pages > 1 || page > 1) && <div className="flex items-center justify-between border-t border-border px-4 py-3 text-caption"><span>Страница {page} из {pages}</span><div className="flex gap-2"><Button size="sm" variant="secondary" aria-label="Предыдущая страница" disabled={page <= 1} onClick={() => changeFilters({ page: String(page - 1) })}><TbArrowLeft aria-hidden /></Button><Button size="sm" variant="secondary" aria-label="Следующая страница" disabled={page >= pages} onClick={() => changeFilters({ page: String(page + 1) })}><TbArrowRight aria-hidden /></Button></div></div>}
					</div>
					<p className="mt-3 text-caption text-ink-muted">Удалить можно только продукт без партий.</p>
				</section>
				<ProductEditor key={`${selected?.id ?? 'new'}-${editorRevision}`} product={selected} units={units.data ?? []} userId={userId} onDone={resetEditor} />
			</div>
			<Modal isOpen={!!deleting} onClose={() => { if (!remove.isPending) setDeleting(null) }}><h2 className="pr-8 !text-title">Удалить продукт?</h2><p className="mt-4 text-ink-muted">«{deleting?.name}» будет удалён из справочника. Действие нельзя отменить.</p>{deleteError && <p role="alert" className="mt-3 text-danger">{deleteError}</p>}<div className="mt-6 flex gap-2"><Button disabled={remove.isPending} onClick={() => deleting && remove.mutate(deleting.id)}>{remove.isPending ? 'Удаляем…' : 'Удалить'}</Button><Button variant="ghost" disabled={remove.isPending} onClick={() => setDeleting(null)}>Отмена</Button></div></Modal>
		</>
	)
}

