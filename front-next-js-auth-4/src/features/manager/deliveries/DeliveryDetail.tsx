'use client'

import { Button } from '@/components/ui/Button'
import { Loading } from '@/components/ui/PizzaLoader'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { managerError } from '../api/manager.api'
import { ManagerAccess } from '../components/ManagerAccess'
import { MANAGER_ROUTES } from '../config/manager.routes'
import { deliveriesApi, deliveryKeys, receiptDate } from './deliveries.api'

function Receipt({ id, userId }: { id: string; userId: string }) {
	const query = useQuery({
		queryKey: deliveryKeys.detail(userId, id),
		queryFn: () => deliveriesApi.get(id),
		retry: false
	})
	return (
		<>
			<Link className="inline-flex min-h-10 items-center rounded-full bg-surface-raised px-4 font-semibold text-ink shadow-card hover:bg-tint" href={MANAGER_ROUTES.DELIVERIES}>
				← Поставки
			</Link>
			{query.isPending ? (
				<Loading label="Загрузка поставки…" className="mt-6" />
			) : query.isError ? (
				<div role="alert" className="mt-6">
					<p>{managerError(query.error)}</p>
					<Button onClick={() => query.refetch()}>Повторить</Button>
				</div>
			) : (
				<section className="mt-6 rounded-lg border border-border bg-surface-raised p-5 sm:p-8">
					<p className="mb-3 inline-flex rounded-full bg-fire-tint px-4 py-1 text-caption font-bold text-fire-ink">Поставка проведена</p>
					<h1 className="break-words">Накладная № {query.data.number}</h1>
					<dl className="my-6 grid gap-4 sm:grid-cols-3">
						<div>
							<dt className="text-ink-muted">Поставщик</dt>
							<dd className="break-words font-semibold">
								{query.data.supplier?.name ?? 'Не указан (старая поставка)'}
							</dd>
						</div>
						<div>
							<dt className="text-ink-muted">Принято</dt>
							<dd>{receiptDate(query.data.createDate)}</dd>
						</div>
						<div>
							<dt className="text-ink-muted">Менеджер</dt>
							<dd>{query.data.creater.name}</dd>
						</div>
					</dl>
					<div className="relative overflow-x-auto">
						<table className="w-full min-w-[640px] text-left">
							<thead>
								<tr className="border-b border-border">
									<th className="p-3">Продукт / партия</th>
									<th className="p-3">Принято</th>
									<th className="p-3">Текущий остаток</th>
									<th className="p-3">Годен до</th>
								</tr>
							</thead>
							<tbody>
								{query.data.batches.map((batch) => (
									<tr key={batch.id} className="border-b border-border">
										<td className="p-3">
											<b>
												{batch.productNameAtReceipt ??
													batch.product.nameProduct}
											</b>
											<small className="mt-1 block text-ink-muted">
												{batch.id}
											</small>
										</td>
										<td className="p-3">
											{batch.receivedCount ?? 'Не зафиксировано'}{' '}
											{batch.unitNameAtReceipt ?? batch.product.unit.name}
										</td>
										<td className="p-3">
											{batch.count}{' '}
											{batch.unitNameAtReceipt ?? batch.product.unit.name}
										</td>
										<td className="p-3">{receiptDate(batch.EXP)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					<p className="mt-5 text-caption text-ink-muted">
						Проведённая поставка доступна только для просмотра. Первоначальное
						количество сохранено отдельно от текущего остатка. Даты отображаются
						в часовом поясе устройства.
					</p>
				</section>
			)}
		</>
	)
}
export function DeliveryDetailPage({ id }: { id: string }) {
	return (
		<ManagerAccess>
			{(userId) => <Receipt id={id} userId={userId} />}
		</ManagerAccess>
	)
}
