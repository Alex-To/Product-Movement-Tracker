'use client'

import { errorCatch } from '@/api/api.helper'
import { Button } from '@/components/ui/Button'
import { Loading } from '@/components/ui/PizzaLoader'
import kitchenService from '@/services/kitchen.service'
import type { IKitchenOrder } from '@/types/kitchen.types'
import { twMerge } from '@/utils/tw-merge'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { TbCheck, TbClock } from 'react-icons/tb'
import { formatDateTime } from './format'

const REFETCH_INTERVAL = 5000
const ORDERS_QUERY_KEY = ['kitchen', 'orders']

interface CardProps {
	order: IKitchenOrder
	isMarking: boolean
	onReady?: () => void
}

function OrderCard({ order, isMarking, onReady }: CardProps) {
	const isReady = !!order.readyAt

	return (
		<li
			className={twMerge(
				'flex flex-col gap-3 rounded-lg p-5 sm:p-6',
				isReady ? 'border border-border bg-surface' : 'bg-surface-raised shadow-card'
			)}
		>
			<div className="flex items-baseline justify-between gap-3">
				<b
					className={twMerge(
						'font-display text-[28px] leading-none font-normal',
						isReady && 'text-ink-muted'
					)}
				>
					№{order.number}
				</b>
				<span className="inline-flex items-center gap-1.5 text-caption text-ink-muted">
					<TbClock
						size={15}
						aria-hidden
					/>
					{formatDateTime(order.createDate)}
				</span>
			</div>
			<p className="text-caption text-ink-muted">{order.creater.name}</p>
			<ul className="flex flex-col gap-2">
				{order.items.map(item =>
					item.exclusions.length > 0 ? (
						<li
							key={item.id}
							className="flex flex-col gap-1 rounded-md bg-fire-tint px-4 py-3"
						>
							<span className="flex justify-between gap-2 font-semibold">
								{item.dish.name}
								<span className="font-mono">× {item.count}</span>
							</span>
							<span className="text-caption font-bold text-fire-ink">
								без:{' '}
								{item.exclusions
									.map(exclusion => exclusion.product.nameProduct)
									.join(', ')}
							</span>
						</li>
					) : (
						<li
							key={item.id}
							className={twMerge(
								'flex justify-between gap-2 rounded-md px-4 py-3 font-semibold',
								isReady ? 'bg-surface-raised' : 'bg-surface'
							)}
						>
							{item.dish.name}
							<span className="font-mono">× {item.count}</span>
						</li>
					)
				)}
			</ul>

			{isReady ? (
				<p className="mt-auto inline-flex items-center gap-1.5 self-start rounded-full bg-tint px-3 py-1 text-caption font-semibold">
					<TbCheck
						size={15}
						aria-hidden
					/>
					Готов · {formatDateTime(order.readyAt!)}
				</p>
			) : (
				<Button
					className="mt-auto min-h-12"
					onClick={onReady}
					disabled={isMarking}
				>
					<TbCheck
						size={20}
						aria-hidden
					/>
					{isMarking ? 'Отмечаем…' : 'Заказ готов'}
				</Button>
			)}
		</li>
	)
}

const GRID = 'grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr))]'

export function KitchenOrders() {
	const queryClient = useQueryClient()

	const { data, isLoading, isError } = useQuery({
		queryKey: ORDERS_QUERY_KEY,
		queryFn: () => kitchenService.fetchOrders(),
		refetchInterval: REFETCH_INTERVAL
	})

	const {
		mutate: markReady,
		isPending,
		variables: markingId
	} = useMutation({
		mutationKey: ['kitchen', 'orders', 'ready'],
		mutationFn: (orderId: string) => kitchenService.markOrderReady(orderId),
		onSuccess() {
			queryClient.invalidateQueries({ queryKey: ORDERS_QUERY_KEY })
		},
		onError(error) {
			toast.error(errorCatch(error))
		}
	})

	const orders = data?.data ?? []
	// Сверху то, что ещё готовится; готовые уходят вниз
	const active = orders.filter(order => !order.readyAt)
	const ready = orders.filter(order => order.readyAt)

	return (
		<section className="flex flex-col gap-6">
			<div>
				<h1>Заказы</h1>
				<p className="mt-2 text-ink-muted">
					Продукты по этим заказам уже списаны. Новые заказы появляются сверху.
				</p>
			</div>

			{isLoading && <Loading size={96} />}
			{isError && <p className="text-danger">Не удалось загрузить заказы</p>}
			{!isLoading && !isError && !orders.length && (
				<p className="text-ink-muted">Заказов пока нет</p>
			)}
			{!isLoading && !isError && !!orders.length && !active.length && (
				<p className="text-ink-muted">Все заказы готовы</p>
			)}

			{active.length > 0 && (
				<ul className={GRID}>
					{active.map(order => (
						<OrderCard
							key={order.id}
							order={order}
							isMarking={isPending && markingId === order.id}
							onReady={() => markReady(order.id)}
						/>
					))}
				</ul>
			)}

			{ready.length > 0 && (
				<>
					<h2 className="mt-4">Готовые</h2>
					<ul className={GRID}>
						{ready.map(order => (
							<OrderCard
								key={order.id}
								order={order}
								isMarking={false}
							/>
						))}
					</ul>
				</>
			)}
		</section>
	)
}
