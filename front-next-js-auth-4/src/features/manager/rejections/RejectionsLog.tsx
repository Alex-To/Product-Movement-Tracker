'use client'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Loading } from '@/components/ui/PizzaLoader'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { managerError } from '../api/manager.api'
import { warehouseDate, warehouseQuantity } from '../warehouse/warehouse.api'
import {
	type OrderRejection,
	REJECTION_REASONS,
	rejectionsApi,
	rejectionsKeys
} from './rejections.api'

const REASON_BADGE = {
	SHORTAGE: 'error',
	STOP_LIST: 'stop',
	BUSY: 'live'
} as const

function RejectionCard({ rejection }: { rejection: OrderRejection }) {
	const shortages = rejection.details.shortages ?? []
	const stopped = rejection.details.stopped ?? []
	return (
		<li className="rounded-md border border-border bg-surface-raised p-4">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<span className="flex flex-wrap items-center gap-2">
					<Badge variant={REASON_BADGE[rejection.reason]}>
						{REJECTION_REASONS[rejection.reason]}
					</Badge>
					<span className="text-caption text-ink-muted">
						{warehouseDate(rejection.createDate)} · {rejection.waiterName}
					</span>
				</span>
			</div>
			<p className="mt-2 break-words">
				{rejection.lines
					.map(
						(line) =>
							`${line.dishName}${line.excluded.length ? ` (без: ${line.excluded.join(', ')})` : ''} × ${line.count}`
					)
					.join(', ')}
			</p>
			{stopped.length > 0 && (
				<p className="mt-1 text-caption text-ink-muted">
					В стоп-листе: {stopped.join(', ')}
				</p>
			)}
			{shortages.length > 0 && (
				<ul className="mt-2 space-y-1 text-caption">
					{shortages.map((shortage) => (
						<li key={shortage.productName} className="break-words">
							<b>{shortage.productName}</b>: нужно{' '}
							<span className="font-mono">
								{warehouseQuantity(shortage.need)} {shortage.unit}
							</span>
							, было годного{' '}
							<span className="font-mono">
								{warehouseQuantity(shortage.available)} {shortage.unit}
							</span>
						</li>
					))}
				</ul>
			)}
		</li>
	)
}

/**
 * Журнал отказов — только у менеджера: какой спрос не удалось закрыть и почему.
 * Сводка за сутки подсказывает, каких продуктов не хватает чаще всего
 */
export function RejectionsLog({ userId }: { userId: string }) {
	const [page, setPage] = useState(1)
	const query = useQuery({
		queryKey: rejectionsKeys.list(userId, page),
		queryFn: () => rejectionsApi.list(page),
		retry: false,
		refetchInterval: 15000,
		refetchOnWindowFocus: true
	})

	return (
		<section aria-labelledby="rejections-title" className="mt-10">
			<h2 id="rejections-title">
				Отказы в <span className="title-accent">заказах</span>
			</h2>
			{query.isPending ? (
				<Loading label="Загрузка отказов…" />
			) : query.isError ? (
				<div role="alert" className="mt-4">
					<p>{managerError(query.error)}</p>
					<Button variant="secondary" onClick={() => query.refetch()}>
						Повторить
					</Button>
				</div>
			) : (
				<>
					<div className="mt-4 rounded-lg bg-surface-raised p-5 shadow-card">
						<p className="font-semibold">
							За сутки: {query.data.last24h.total}
							{query.data.last24h.total > 0 &&
								` — ${(
									Object.keys(REJECTION_REASONS) as (keyof typeof REJECTION_REASONS)[]
								)
									.filter((reason) => query.data.last24h.byReason[reason])
									.map(
										(reason) =>
											`${REJECTION_REASONS[reason].toLowerCase()}: ${query.data.last24h.byReason[reason]}`
									)
									.join(' · ')}`}
						</p>
						{query.data.last24h.topMissing.length > 0 && (
							<p className="mt-2 text-caption text-ink-muted">
								Чаще всего не хватало:{' '}
								{query.data.last24h.topMissing
									.map((item) => `${item.productName} (${item.times})`)
									.join(', ')}
							</p>
						)}
					</div>
					{!query.data.items.length ? (
						<p className="mt-4 text-ink-muted">Отказов пока не было.</p>
					) : (
						<ul className="mt-4 grid gap-3 md:grid-cols-2">
							{query.data.items.map((rejection) => (
								<RejectionCard key={rejection.id} rejection={rejection} />
							))}
						</ul>
					)}
					{(query.data.total > query.data.pageSize || page > 1) && (
						<div className="mt-3 flex items-center gap-3">
							<Button
								size="sm"
								variant="ghost"
								disabled={page <= 1}
								onClick={() => setPage((value) => value - 1)}
							>
								Предыдущие
							</Button>
							<span>Страница {page}</span>
							<Button
								size="sm"
								variant="ghost"
								disabled={page * query.data.pageSize >= query.data.total}
								onClick={() => setPage((value) => value + 1)}
							>
								Следующие
							</Button>
						</div>
					)}
				</>
			)}
		</section>
	)
}
