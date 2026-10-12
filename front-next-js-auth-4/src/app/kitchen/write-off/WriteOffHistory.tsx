'use client'

import kitchenService from '@/services/kitchen.service'
import { Loading } from '@/components/ui/PizzaLoader'
import { useQuery } from '@tanstack/react-query'
import { formatAmount, formatDateTime } from '../format'

export function WriteOffHistory() {
	const { data, isLoading } = useQuery({
		queryKey: ['kitchen', 'write-offs'],
		queryFn: () => kitchenService.fetchWriteOffs()
	})

	const writeOffs = data?.data ?? []

	return (
		<section className="flex max-w-3xl flex-col gap-3">
			<h2>Мои последние списания</h2>
			{isLoading && <Loading className="items-start py-2" />}
			{!isLoading && !writeOffs.length && (
				<p className="text-ink-muted">Списаний пока нет</p>
			)}
			{!!writeOffs.length && (
				<div className="overflow-x-auto rounded-lg bg-surface-raised shadow-card">
					<table className="w-full min-w-[480px] border-collapse text-left">
						<thead className="text-caption font-semibold text-ink-muted">
							<tr>
								<th className="px-6 pt-5 pb-3">Время</th>
								<th className="px-4 pt-5 pb-3">Продукт</th>
								<th className="px-4 pt-5 pb-3">Партия</th>
								<th className="px-6 pt-5 pb-3 text-right">Кол-во</th>
							</tr>
						</thead>
						<tbody>
							{writeOffs.map(w => (
								<tr
									key={w.id}
									className="border-t border-tint"
								>
									<td className="px-6 py-3 text-ink-muted">
										{formatDateTime(w.createDate)}
									</td>
									<td className="px-4 py-3 font-semibold">
										{w.batch.product.nameProduct}
									</td>
									<td className="px-4 py-3">{w.batch.delivery.number}</td>
									<td className="px-6 py-3 text-right font-mono">
										{formatAmount(w.count, w.batch.product.unit.name)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</section>
	)
}
