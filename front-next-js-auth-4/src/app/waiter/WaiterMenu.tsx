'use client'

import { errorCatch } from '@/api/api.helper'
import { Button } from '@/components/ui/Button'
import { Loading } from '@/components/ui/PizzaLoader'
import waiterService from '@/services/waiter.service'
import type { IOrderRejection } from '@/types/waiter.types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { TbSearch } from 'react-icons/tb'
import { DishRow } from './DishRow'
import { ExcludeModal } from './ExcludeModal'
import { formatPortions } from './format'
import { OrderCheck } from './OrderCheck'
import { OrderRejectedModal } from './OrderRejectedModal'
import { dishCounts, lineName, type TCart, useCart } from './useCart'

const REFETCH_INTERVAL = 5000
const MENU_QUERY_KEY = ['waiter', 'menu']

// «Ёжик» и «ежик», регистр и лишние пробелы не мешают поиску
const normalize = (value: string) =>
	value.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim()

const isRejection =(data: unknown): data is IOrderRejection =>
	!!data &&
	typeof data === 'object' &&
	Array.isArray((data as IOrderRejection).shortages)

export function WaiterMenu() {
	const queryClient = useQueryClient()

	const { data: menu, isLoading, isError } = useQuery({
		queryKey: MENU_QUERY_KEY,
		queryFn: () => waiterService.fetchMenu(),
		select: response => response.data,
		refetchInterval: REFETCH_INTERVAL
	})

	const { cart, adjustments, add, canAdd, remove, clear, limitTo, totalPortions } =
		useCart(menu)

	const [rejected, setRejected] = useState<{
		rejection: IOrderRejection
		cart: TCart
	} | null>(null)

	const { mutate: sendOrder, isPending: isSending } = useMutation({
		mutationKey: ['waiter', 'order'],
		mutationFn: () =>
			waiterService.createOrder({
				items: Object.values(cart).map(line => ({
					dishId: line.dishId,
					count: line.count,
					...(line.excluded.length && { excludedProductIds: line.excluded })
				}))
			}),
		onSuccess({ data }) {
			toast.success(`Заказ №${data.id.slice(-5)} принят`)
			clear()
		},
		onError(error) {
			const body = axios.isAxiosError(error) ? error.response?.data : null

			if (axios.isAxiosError(error) && error.response?.status === 409 && isRejection(body)) {
				setRejected({ rejection: body, cart })
			} else {
				toast.error(errorCatch(error))
			}
		},
		onSettled() {
			queryClient.invalidateQueries({ queryKey: MENU_QUERY_KEY })
		}
	})

	// Блюдо, из которого гость просит что-то убрать. Храним id: меню
	// обновляется каждые 5 секунд, и окно должно видеть свежие остатки
	const [excludingId, setExcludingId] = useState<string | null>(null)
	const excluding = menu?.find(dish => dish.id === excludingId) ?? null

	const counts = dishCounts(cart)

	const [search, setSearch] = useState('')
	const query = normalize(search)
	// Фильтр сохраняет порядок меню: горячие наверху, стоп-лист внизу
	const found = query
		? (menu ?? []).filter(dish => normalize(dish.name).includes(query))
		: (menu ?? [])

	const available = found.filter(dish => !dish.isStopped)
	const stopped = found.filter(dish => dish.isStopped)

	const renderRows = (dishes: typeof available) => (
		<ul className="flex flex-col gap-3">
			{dishes.map(dish => (
				<DishRow
					key={dish.id}
					dish={dish}
					count={cart[dish.id]?.count ?? 0}
					total={counts[dish.id] ?? 0}
					canAdd={canAdd(dish)}
					onAdd={() => add(dish)}
					onRemove={() => remove(dish.id)}
					onExclude={() => setExcludingId(dish.id)}
				/>
			))}
		</ul>
	)

	return (
		<div className="grid gap-8 pb-28 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:pb-0">
			<section className="min-w-0">
				<h1>Меню</h1>
				<p className="mt-2 mb-6 text-ink-muted">
					Порции обновляются автоматически.
				</p>

				{!!menu?.length && (
					<div className="relative mb-5">
						<label
							htmlFor="menu-search"
							className="sr-only"
						>
							Поиск блюда
						</label>
						<TbSearch
							size={20}
							aria-hidden
							className="pointer-events-none absolute top-1/2 left-5 -translate-y-1/2 text-ink-muted"
						/>
						<input
							id="menu-search"
							type="search"
							value={search}
							onChange={e => setSearch(e.target.value)}
							placeholder="Поиск блюда"
							autoComplete="off"
							className="min-h-13 w-full rounded-full border border-border bg-surface-raised pr-5 pl-13 text-ink placeholder:text-ink-muted focus:outline-2 focus:outline-offset-2 focus:outline-accent"
						/>
					</div>
				)}

				{!!menu?.length && query && !found.length && (
					<p className="text-ink-muted">
						Ничего не нашлось по запросу «{search.trim()}».
					</p>
				)}

				{isLoading && (
					<Loading size={96} />
				)}
				{isError && (
					<p className="text-danger">
						Не удалось загрузить меню. Обновите страницу.
					</p>
				)}
				{menu && !menu.length && (
					<p className="text-ink-muted">
						Блюд пока нет — их заводит менеджер.
					</p>
				)}

				{available.length > 0 && renderRows(available)}

				{stopped.length > 0 && (
					<>
						<h2 className="mt-8 mb-3">В стоп-листе</h2>
						{renderRows(stopped)}
					</>
				)}
			</section>

			<aside className="lg:sticky lg:top-24">
				{menu && (
					<OrderCheck
						menu={menu}
						cart={cart}
						adjustments={adjustments}
						totalPortions={totalPortions}
						isSending={isSending}
						canAdd={canAdd}
						onAdd={add}
						onRemove={remove}
						onClear={clear}
						onSend={() => sendOrder()}
					/>
				)}
			</aside>

			{totalPortions > 0 && (
				// Плавающая золотая панель чека на телефоне и вертикальном планшете
				<div className="fixed inset-x-3 bottom-4 z-20 sm:inset-x-6 sm:bottom-6 lg:hidden">
					<div className="mx-auto flex min-h-16 max-w-3xl items-center justify-between gap-3 rounded-full bg-gold py-2 pr-2 pl-6 text-[#1f2b33] shadow-popover">
						<span className="text-[16px] font-bold">
							В чеке: {formatPortions(totalPortions)}
						</span>
						<Button
							className="min-h-12 bg-[#1f2b33] px-6 text-[#f5f2ec] hover:bg-[#2e3e49]"
							onClick={() =>
								document
									.getElementById('check')
									?.scrollIntoView({ behavior: 'smooth' })
							}
						>
							К чеку
						</Button>
					</div>
				</div>
			)}

			<ExcludeModal
				dish={excluding}
				canAdd={canAdd}
				onAdd={(dish, excluded) => {
					add(dish, excluded)
					setExcludingId(null)
					toast.success(`В чеке: ${lineName(dish, excluded)}`)
				}}
				onClose={() => setExcludingId(null)}
			/>

			<OrderRejectedModal
				rejection={rejected?.rejection ?? null}
				cart={rejected?.cart ?? {}}
				onClose={() => setRejected(null)}
				onLimit={() => {
					if (rejected) limitTo(rejected.rejection.available)
					setRejected(null)
				}}
			/>
		</div>
	)
}
