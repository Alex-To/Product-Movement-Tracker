'use client'
import Link from 'next/link'
import { MANAGER_ROUTES } from '../config/manager.routes'
import {
	warehouseDate,
	warehouseQuantity,
	type WarehouseBatch,
	type WarehouseSignals as Signals
} from './warehouse.api'

function BatchSignal({ batch }: { batch: WarehouseBatch }) {
	return (
		<li className="border-b border-border py-3 last:border-0">
			<b className="break-words">{batch.productName}</b>
			<p className="mt-1 text-caption">
				{warehouseQuantity(batch.quantity)} {batch.unit} ·{' '}
				{batch.expired ? 'Истекло' : 'Годен до'}{' '}
				{warehouseDate(batch.expiresAt)}
			</p>
			<Link
				href={`${MANAGER_ROUTES.DELIVERIES}/${batch.delivery.id}`}
				className="mt-1 inline-block break-words text-caption text-accent underline"
			>
				Накладная № {batch.delivery.number}
			</Link>
		</li>
	)
}
export function WarehouseSignals({ data }: { data: Signals }) {
	return (
		<div className="mb-7 grid items-start gap-4 lg:grid-cols-3">
			<section
				aria-label="Истекают в ближайшие 24 часа"
				className="min-w-0 rounded-lg border border-fire bg-fire-tint p-5"
			>
				<h2 className="!text-title text-fire-ink">
					Истекают в ближайшие 24 ч · {data.expiring.total}
				</h2>
				<ul className="mt-2 max-h-64 overflow-y-auto">
					{data.expiring.items.map((batch) => (
						<BatchSignal key={batch.id} batch={batch} />
					))}
				</ul>
				{!data.expiring.total && (
					<p className="mt-3 text-caption text-ink-muted">Таких партий нет.</p>
				)}
				{data.expiring.total > data.limit && (
					<p className="mt-3 text-caption">
						Показаны первые {data.limit} партий.
					</p>
				)}
			</section>
			<section
				aria-label="Просроченные партии"
				className="min-w-0 rounded-lg border border-danger bg-danger-tint p-5"
			>
				<h2 className="!text-title text-danger">
					Просрочено · {data.expired.total}
				</h2>
				<ul className="mt-2 max-h-64 overflow-y-auto">
					{data.expired.items.map((batch) => (
						<BatchSignal key={batch.id} batch={batch} />
					))}
				</ul>
				{!data.expired.total && (
					<p className="mt-3 text-caption text-ink-muted">
						Просроченных остатков нет.
					</p>
				)}
				<p className="mt-3 text-caption text-ink-muted">
					Просроченное не входит в годные остатки и порции.
				</p>
				{data.expired.total > data.limit && (
					<p className="mt-3 text-caption">
						Показаны первые {data.limit} партий.
					</p>
				)}
			</section>
			<section
				aria-label="Блюда в стоп-листе"
				className="min-w-0 rounded-lg border border-border bg-surface-raised p-5"
			>
				<h2 className="!text-title">
					Блюда в стоп-листе · {data.stopped.total}
				</h2>
				<ul className="mt-2 max-h-64 overflow-y-auto">
					{data.stopped.items.map((dish) => (
						<li
							key={dish.id}
							className="border-b border-border py-3 last:border-0"
						>
							<Link
								href={`${MANAGER_ROUTES.DISHES}/${dish.id}`}
								className="break-words font-semibold text-accent underline"
							>
								{dish.name}
							</Link>
							<p className="mt-1 text-caption">
								{dish.autoStop && 'AUTO: не хватает на порцию'}
								{dish.autoStop && dish.manualStop && ' · '}
								{dish.manualStop && 'MANUAL: ручной стоп кухни'}
							</p>
							{dish.autoStop && (
								<p className="mt-1 break-words text-caption text-ink-muted">
									{dish.missing.length
										? `Не хватает: ${dish.missing.join(', ')}`
										: 'Проверьте состав рецепта.'}
								</p>
							)}
						</li>
					))}
				</ul>
				{!data.stopped.total && (
					<p className="mt-3 text-caption text-ink-muted">
						Блюд в стоп-листе нет.
					</p>
				)}
				{data.stopped.total > data.limit && (
					<p className="mt-3 text-caption">
						Показаны первые {data.limit} блюд.
					</p>
				)}
			</section>
		</div>
	)
}
