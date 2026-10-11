'use client'

import kitchenService from '@/services/kitchen.service'
import { useQuery } from '@tanstack/react-query'
import { formatDateTime } from './format'

const REFETCH_INTERVAL = 5000

export function KitchenOrders() {
	const { data, isLoading, isError } = useQuery({
		queryKey: ['kitchen', 'orders'],
		queryFn: () => kitchenService.fetchOrders(),
		refetchInterval: REFETCH_INTERVAL
	})

	const orders = data?.data ?? []

	return (
		<section>
			<h1 className="mb-2">Заказы</h1>
			<p className="text-sm text-zinc-400 mb-4">
				Продукты по этим заказам уже списаны. Новые заказы появляются сверху.
			</p>

			{isLoading && <p>Загрузка…</p>}
			{isError && <p>Не удалось загрузить заказы</p>}
			{!isLoading && !isError && !orders.length && <p>Заказов пока нет</p>}

			<ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{orders.map(order => (
					<li
						key={order.id}
						className="border border-zinc-700 rounded p-3"
					>
						<div className="flex justify-between gap-2">
							<b>№{order.id.slice(-5)}</b>
							<span className="text-sm text-zinc-400">
								{formatDateTime(order.createDate)}
							</span>
						</div>
						<p className="text-sm text-zinc-400 mb-2">{order.creater.name}</p>
						<ul>
							{order.items.map(item => (
								<li key={item.id}>
									{item.dish.name} × {item.count}
								</li>
							))}
						</ul>
					</li>
				))}
			</ul>
		</section>
	)
}
