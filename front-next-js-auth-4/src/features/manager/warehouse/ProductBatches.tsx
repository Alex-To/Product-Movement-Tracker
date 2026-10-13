'use client'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Loading } from '@/components/ui/PizzaLoader'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { Fragment, useState } from 'react'
import toast from 'react-hot-toast'
import { managerError } from '../api/manager.api'
import { MANAGER_ROUTES } from '../config/manager.routes'
import { RemainingTime } from './RemainingTime'
import {
	type WarehouseBatch,
	warehouseApi,
	warehouseDate,
	warehouseKeys,
	warehouseQuantity
} from './warehouse.api'

// Партии идут по сроку: сначала те, из которых уже нельзя готовить, потом годные, потом просроченные
const GROUPS = {
	unusable: {
		title: 'Нельзя готовить — партию списывает менеджер',
		className: 'bg-danger-tint text-danger'
	},
	good: {
		title: 'Годные партии — по ближайшему сроку',
		className: 'bg-surface text-fire-ink'
	},
	expired: {
		title: 'Просроченные',
		className: 'bg-danger-tint text-danger'
	}
}
const groupOf = (batch: WarehouseBatch): keyof typeof GROUPS =>
	batch.status === 'expired'
		? 'expired'
		: batch.status === 'unusable'
			? 'unusable'
			: 'good'

export function ProductBatches({
	userId,
	productId
}: {
	userId: string
	productId: string
}) {
	const client = useQueryClient()
	const [page, setPage] = useState(1)
	const [confirming, setConfirming] = useState<WarehouseBatch | null>(null)
	const query = useQuery({
		queryKey: warehouseKeys.batches(userId, productId, page),
		queryFn: () => warehouseApi.batches(productId, page),
		retry: false,
		refetchInterval: 15000,
		refetchOnWindowFocus: true
	})
	const writeOff = useMutation({
		mutationFn: warehouseApi.writeOffBatch,
		onSuccess() {
			toast.success('Партия списана')
			setConfirming(null)
			client.invalidateQueries({ queryKey: warehouseKeys.all })
		},
		onError: (error) => toast.error(managerError(error))
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
				Годных партий: {data.goodCount}
				{data.unusableCount > 0 && ` · Нельзя готовить: ${data.unusableCount}`} ·
				Просроченных: {data.expiredCount}. Пустые партии скрыты.
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
						{data.items.map((batch, index) => {
							const group = groupOf(batch)
							const unusable = group === 'unusable'
							return (
								<Fragment key={batch.id}>
									{(index === 0 ||
										group !== groupOf(data.items[index - 1])) && (
										<tr>
											<td
												colSpan={4}
												className={`px-3 py-2 font-semibold ${GROUPS[group].className}`}
											>
												{GROUPS[group].title}
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
										<td
											className={`p-3 ${batch.expired || unusable ? 'text-danger' : ''}`}
										>
											<RemainingTime batch={batch} />
											{batch.status === 'urgent' && (
												<Badge variant="fire" className="ml-2">
													Срочно
												</Badge>
											)}
											{unusable && (
												<Button
													size="sm"
													variant="secondary"
													className="mt-2 flex"
													onClick={() => setConfirming(batch)}
												>
													Списать партию
												</Button>
											)}
										</td>
									</tr>
								</Fragment>
							)
						})}
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

			<Modal
				isOpen={!!confirming}
				onClose={() => {
					if (!writeOff.isPending) setConfirming(null)
				}}
			>
				<h2 className="pr-8 !text-title">Списать партию целиком?</h2>
				{confirming && (
					<p className="mt-4 break-words text-ink-muted">
						{confirming.productName} ·{' '}
						{warehouseQuantity(confirming.quantity)} {confirming.unit} ·
						накладная № {confirming.delivery.number}. Из партии уже нельзя
						готовить. Отменить списание нельзя.
					</p>
				)}
				<div className="mt-6 flex flex-wrap gap-3">
					<Button
						disabled={writeOff.isPending}
						onClick={() => confirming && writeOff.mutate(confirming.id)}
					>
						{writeOff.isPending ? 'Списываем…' : 'Списать'}
					</Button>
					<Button
						variant="ghost"
						disabled={writeOff.isPending}
						onClick={() => setConfirming(null)}
					>
						Отмена
					</Button>
				</div>
			</Modal>
		</section>
	)
}
