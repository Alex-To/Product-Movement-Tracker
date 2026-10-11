'use client'

import kitchenService from '@/services/kitchen.service'
import { useQuery } from '@tanstack/react-query'
import { TbClock } from 'react-icons/tb'
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
		<section className="flex flex-col gap-6">
			<div>
				<h1>Заказы</h1>
				<p className="mt-2 text-ink-muted">
					Продукты по этим заказам уже списаны. Новые заказы появляются сверху.
				</p>
			</div>

			{isLoading && (
				<div
					role="status"
					aria-label="Загрузка"
					className="mx-auto mt-10 size-8 animate-spin rounded-full border-2 border-border border-t-accent"
				/>
			)}
			{isError && <p className="text-danger">Не удалось загрузить заказы</p>}
			{!isLoading && !isError && !orders.length && (
				<p className="text-ink-muted">Заказов пока нет</p>
			)}

			<ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr))]">
				{orders.map(order => (
					<li
						key={order.id}
						className="flex flex-col gap-3 rounded-lg bg-surface-raised p-5 shadow-card sm:p-6"
					>
						<div className="flex items-baseline justify-between gap-3">
							<b className="font-display text-[28px] leading-none font-normal">
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
										className="flex justify-between gap-2 rounded-md bg-surface px-4 py-3 font-semibold"
									>
										{item.dish.name}
										<span className="font-mono">× {item.count}</span>
									</li>
								)
							)}
						</ul>
					</li>
				))}
			</ul>
		</section>
	)
}
