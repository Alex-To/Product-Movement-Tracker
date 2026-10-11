'use client'
import { Button } from '@/components/ui/Button'
import { Fragment, useState } from 'react'
import { ProductBatches } from './ProductBatches'
import {
	warehouseDate,
	warehouseQuantity,
	type WarehouseProducts
} from './warehouse.api'

export function ProductsTable({
	data,
	userId,
	page,
	setPage
}: {
	data: WarehouseProducts
	userId: string
	page: number
	setPage: (page: number) => void
}) {
	const [expanded, setExpanded] = useState<Set<string>>(new Set())
	const toggle = (id: string) =>
		setExpanded((current) => {
			const next = new Set(current)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})
	return (
		<>
			<div className="relative overflow-x-auto rounded-lg border border-border bg-surface-raised">
				<table className="w-full min-w-[800px] text-left text-caption">
					<thead className="border-b border-border bg-surface text-ink-muted">
						<tr>
							<th className="p-4">Продукт</th>
							<th className="p-4">Ед.</th>
							<th className="p-4 text-right">Годный остаток</th>
							<th className="p-4 text-right">Партий</th>
							<th className="p-4">Ближайший срок</th>
							<th className="p-4">Статус</th>
						</tr>
					</thead>
					<tbody>
						{data.items.map((product) => (
							<Fragment key={product.id}>
								<tr
									className={`cursor-pointer border-b border-border ${expanded.has(product.id) ? 'bg-tint' : 'hover:bg-surface'}`}
									onClick={(event) => {
										if (!(event.target as Element).closest('button,a'))
											toggle(product.id)
									}}
								>
									<td className="p-4">
										<button
											type="button"
											className="flex max-w-sm items-start gap-2 text-left font-semibold text-ink"
											aria-expanded={expanded.has(product.id)}
											aria-controls={`warehouse-batches-${product.id}`}
											aria-label={`Партии продукта: ${product.name}`}
											onClick={() => toggle(product.id)}
										>
											<span aria-hidden>
												{expanded.has(product.id) ? '▾' : '▸'}
											</span>
											<span className="break-words">{product.name}</span>
										</button>
									</td>
									<td className="p-4">{product.unit}</td>
									<td className="p-4 text-right font-mono">
										{warehouseQuantity(product.availableQuantity)}
									</td>
									<td className="p-4 text-right">{product.batchesCount}</td>
									<td className="p-4">
										{product.nearestExpiry ? (
											<>
												{warehouseDate(product.nearestExpiry)}
												{product.nearestExpired && (
													<span className="mt-1 block text-danger">Истёк</span>
												)}
											</>
										) : (
											'—'
										)}
									</td>
									<td className="p-4">
										<div className="flex flex-col items-start gap-2">
											{product.expiring && (
												<span className="rounded-sm bg-fire-tint px-2 py-1 text-fire-ink">
													Истекает
												</span>
											)}
											{product.hasExpired && (
												<span className="rounded-sm bg-danger-tint px-2 py-1 text-danger">
													Есть просрочка ·{' '}
													{warehouseQuantity(product.expiredQuantity)}{' '}
													{product.unit}
												</span>
											)}
											{product.availableQuantity === '0.000' && (
												<span className="text-ink-muted">
													Нет годного остатка
												</span>
											)}
											{!product.expiring &&
												!product.hasExpired &&
												product.availableQuantity !== '0.000' && (
													<span className="text-ink-muted">ОК</span>
												)}
										</div>
									</td>
								</tr>
								{expanded.has(product.id) && (
									<tr className="border-b border-border bg-surface">
										<td colSpan={6} id={`warehouse-batches-${product.id}`}>
											<ProductBatches productId={product.id} userId={userId} />
										</td>
									</tr>
								)}
							</Fragment>
						))}
					</tbody>
				</table>
				{!data.items.length && (
					<p className="p-8 text-center text-ink-muted">Продукты не найдены.</p>
				)}
			</div>
			<div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-caption">
				<span>
					Страница {page} · Всего продуктов: {data.total}
				</span>
				<div className="flex gap-2">
					<Button
						size="sm"
						variant="secondary"
						disabled={page <= 1}
						onClick={() => setPage(page - 1)}
					>
						Предыдущая
					</Button>
					<Button
						size="sm"
						variant="secondary"
						disabled={page * data.pageSize >= data.total}
						onClick={() => setPage(page + 1)}
					>
						Следующая
					</Button>
				</div>
			</div>
		</>
	)
}
