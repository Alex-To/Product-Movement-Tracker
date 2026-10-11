'use client'

import { errorCatch } from '@/api/api.helper'
import { Button } from '@/components/ui/Button'
import waiterService from '@/services/waiter.service'
import type { IOrderRejection } from '@/types/waiter.types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { DishRow } from './DishRow'
import { formatPortions } from './format'
import { OrderCheck } from './OrderCheck'
import { OrderRejectedModal } from './OrderRejectedModal'
import { type TCart, useCart } from './useCart'

const REFETCH_INTERVAL = 5000
const MENU_QUERY_KEY = ['waiter', 'menu']

const isRejection = (data: unknown): data is IOrderRejection =>
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

	const { cart, adjustments, add, remove, clear, limitTo, totalPortions } =
		useCart(menu)

	const [rejected, setRejected] = useState<{
		rejection: IOrderRejection
		cart: TCart
	} | null>(null)

	const { mutate: sendOrder, isPending: isSending } = useMutation({
		mutationKey: ['waiter', 'order'],
		mutationFn: () =>
			waiterService.createOrder({
				items: Object.entries(cart).map(([dishId, count]) => ({
					dishId,
					count
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

	const available = menu?.filter(dish => !dish.isStopped) ?? []
	const stopped = menu?.filter(dish => dish.isStopped) ?? []

	const renderRows = (dishes: typeof available) => (
		<ul className="flex flex-col gap-3">
			{dishes.map(dish => (
				<DishRow
					key={dish.id}
					dish={dish}
					count={cart[dish.id] ?? 0}
					onAdd={() => add(dish)}
					onRemove={() => remove(dish.id)}
				/>
			))}
		</ul>
	)

	return (
		<div className="grid gap-6 pb-20 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:pb-0">
			<section className="min-w-0">
				<h1>Меню</h1>
				<p className="mt-1 mb-6 text-caption text-ink-muted">
					Сначала то, что выгоднее продать сейчас, ниже — по приоритету, в самом
					низу — стоп-лист. Порции обновляются автоматически.
				</p>

				{isLoading && (
					<div
						role="status"
						aria-label="Загрузка"
						className="mx-auto mt-10 size-8 animate-spin rounded-full border-2 border-border border-t-accent"
					/>
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
						onClear={clear}
						onSend={() => sendOrder()}
					/>
				)}
			</aside>

			{totalPortions > 0 && (
				<div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface-raised px-4 py-3 shadow-popover lg:hidden">
					<div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
						<span className="font-semibold">
							В чеке: {formatPortions(totalPortions)}
						</span>
						<Button
							size="sm"
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
