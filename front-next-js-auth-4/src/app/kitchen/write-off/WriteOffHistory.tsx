'use client'

import kitchenService from '@/services/kitchen.service'
import { useQuery } from '@tanstack/react-query'
import { formatAmount, formatDateTime } from '../format'

export function WriteOffHistory() {
	const { data, isLoading } = useQuery({
		queryKey: ['kitchen', 'write-offs'],
		queryFn: () => kitchenService.fetchWriteOffs()
	})

	const writeOffs = data?.data ?? []

	return (
		<section>
			<h2 className="mb-3">Мои последние списания</h2>
			{isLoading && <p>Загрузка…</p>}
			{!isLoading && !writeOffs.length && <p>Списаний пока нет</p>}
			{!!writeOffs.length && (
				<div className="overflow-x-auto">
					<table className="w-full text-left">
						<thead>
							<tr>
								<th className="p-2">Время</th>
								<th className="p-2">Продукт</th>
								<th className="p-2">Партия</th>
								<th className="p-2">Кол-во</th>
							</tr>
						</thead>
						<tbody>
							{writeOffs.map(w => (
								<tr
									key={w.id}
									className="border-t border-zinc-700"
								>
									<td className="p-2">{formatDateTime(w.createDate)}</td>
									<td className="p-2">{w.batch.product.nameProduct}</td>
									<td className="p-2">{w.batch.delivery.number}</td>
									<td className="p-2">
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
