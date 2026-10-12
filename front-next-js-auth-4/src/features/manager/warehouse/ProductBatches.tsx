'use client'
import { Button } from '@/components/ui/Button'
import { Loading } from '@/components/ui/PizzaLoader'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Fragment, useState } from 'react'
import { managerError } from '../api/manager.api'
import { MANAGER_ROUTES } from '../config/manager.routes'
import {
	remainingTime,
	warehouseApi,
	warehouseDate,
	warehouseKeys,
	warehouseQuantity
} from './warehouse.api'

export function ProductBatches({
	userId,
	productId
}: {
	userId: string
	productId: string
}) {
	const [page, setPage] = useState(1)
	const query = useQuery({
		queryKey: warehouseKeys.batches(userId, productId, page),
		queryFn: () => warehouseApi.batches(productId, page),
		retry: false,
		refetchInterval: 15000,
		refetchOnWindowFocus: true
	})
	if (query.isPending)
		return (
			<Loading size={32} label="Загрузка партий…" className="py-4" />
		)
	if (query.isError)
		return (
			<div role="alert" className="p-4">
				<p>{managerError(query.error)}</p>
				<Button variant="secondary" onClick={() => query.refetch()}>
					Повторить
				</Button>
			</div>
		)
	const data = query.data
	return (
		<section aria-label={`Партии: ${data.product.name}`} className="p-4">
			<p className="mb-3 text-caption text-ink-muted">
				Годных партий: {data.goodCount} · Просроченных: {data.expiredCount}.
				Пустые партии скрыты.
			</p>
			{!data.items.length ? (
				<p className="py-3 text-ink-muted">
					{page > 1
						? 'На этой странице больше нет партий.'
						: 'Партий с положительным остатком нет.'}
				</p>
			) : (
				<table className="w-full text-left text-caption">
					<thead className="border-b border-border text-ink-muted">
						<tr>
							<th className="p-3">Партия / поставка</th>
							<th className="p-3">Остаток</th>
							<th className="p-3">Годен до</th>
							<th className="p-3">Осталось</th>
						</tr>
					</thead>
					<tbody>
						{data.items.map((batch, index) => (
							<Fragment key={batch.id}>
								{(index === 0 ||
									batch.expired !== data.items[index - 1].expired) && (
									<tr>
										<td
											colSpan={4}
											className={`px-3 py-2 font-semibold ${batch.expired ? 'bg-danger-tint text-danger' : 'bg-surface text-fire-ink'}`}
										>
											{batch.expired
												? 'Просроченные'
												: 'Годные партии — по ближайшему сроку'}
										</td>
									</tr>
								)}
								<tr className="border-b border-border">
									<td className="p-3">
										<Link
											className="font-semibold text-gold-ink underline"
											href={`${MANAGER_ROUTES.DELIVERIES}/${batch.delivery.id}`}
										>
											№ {batch.delivery.number}
										</Link>
										<small className="mt-1 block text-ink-muted">
											{batch.id}
										</small>
										{batch.delivery.supplier && (
											<span className="mt-1 block">
												{batch.delivery.supplier.name}
											</span>
										)}
									</td>
									<td className="p-3 font-mono">
										{warehouseQuantity(batch.quantity)} {batch.unit}
									</td>
									<td className="p-3">{warehouseDate(batch.expiresAt)}</td>
									<td className={`p-3 ${batch.expired ? 'text-danger' : ''}`}>
										{remainingTime(batch)}
									</td>
								</tr>
							</Fragment>
						))}
					</tbody>
				</table>
			)}
			{(data.total > data.pageSize || page > 1) && (
				<div className="mt-3 flex items-center gap-3">
					<Button
						size="sm"
						variant="ghost"
						disabled={page <= 1}
						onClick={() => setPage((value) => value - 1)}
					>
						Предыдущие партии
					</Button>
					<span>Страница {page}</span>
					<Button
						size="sm"
						variant="ghost"
						disabled={page * data.pageSize >= data.total}
						onClick={() => setPage((value) => value + 1)}
					>
						Следующие партии
					</Button>
				</div>
			)}
		</section>
	)
}
