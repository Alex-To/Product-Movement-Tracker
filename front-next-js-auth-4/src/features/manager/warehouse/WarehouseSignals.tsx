'use client'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { managerError } from '../api/manager.api'
import { MANAGER_ROUTES } from '../config/manager.routes'
import {
	type AutoWriteOff,
	warehouseApi,
	warehouseDate,
	warehouseKeys,
	warehouseQuantity,
	type WarehouseBatch,
	type WarehouseSignals as Signals
} from './warehouse.api'

function DeliveryLink({ batch }: { batch: WarehouseBatch }) {
	return (
		<Link
			href={`${MANAGER_ROUTES.DELIVERIES}/${batch.delivery.id}`}
			className="mt-1 inline-block break-words text-caption font-semibold text-gold-ink underline"
		>
			Накладная № {batch.delivery.number}
		</Link>
	)
}

function BatchSignal({ batch }: { batch: WarehouseBatch }) {
	return (
		<li className="border-b border-border py-3 last:border-0">
			<span className="flex flex-wrap items-center gap-2">
				<b className="break-words">{batch.productName}</b>
				{batch.status === 'unusable' && (
					<Badge variant="error">Нельзя готовить</Badge>
				)}
			</span>
			<p className="mt-1 text-caption">
				{warehouseQuantity(batch.quantity)} {batch.unit} ·{' '}
				{batch.expired ? 'Истекло' : 'Годен до'}{' '}
				{warehouseDate(batch.expiresAt)}
			</p>
			<DeliveryLink batch={batch} />
		</li>
	)
}

function AutoWriteOffSignal({
	item,
	onRead,
	disabled
}: {
	item: AutoWriteOff
	onRead: () => void
	disabled: boolean
}) {
	return (
		<li className="border-b border-danger/20 py-3 last:border-0">
			<b className="break-words">{item.batch.productName}</b>
			<p className="mt-1 text-caption">
				{warehouseQuantity(item.quantity)} {item.batch.unit} · истекло{' '}
				{warehouseDate(item.batch.expiresAt)}
			</p>
			<p className="mt-1 text-caption font-semibold text-danger">
				Списано системой автоматически · {warehouseDate(item.writtenOffAt)}
			</p>
			<div className="mt-1 flex flex-wrap items-center justify-between gap-2">
				<DeliveryLink batch={item.batch} />
				<Button
					size="sm"
					variant="ghost"
					disabled={disabled}
					onClick={onRead}
				>
					Понятно
				</Button>
			</div>
		</li>
	)
}

export function WarehouseSignals({ data }: { data: Signals }) {
	const client = useQueryClient()
	const read = useMutation({
		mutationFn: warehouseApi.readMessages,
		onSuccess: () => client.invalidateQueries({ queryKey: warehouseKeys.all }),
		onError: (error) => toast.error(managerError(error))
	})
	// Просроченные остатки система списывает сама; здесь — что она списала
	// и что ещё не успела (между проверками сроков)
	const expiredTotal = data.autoWrittenOff.total + data.expired.total

	return (
		<div className="mb-7 grid items-start gap-4 lg:grid-cols-3">
			<section
				aria-label="Истекающие партии"
				className="min-w-0 rounded-lg border-2 border-fire bg-fire-tint p-6"
			>
				<h2 className="!text-title text-fire-ink">
					Истекают · {data.expiring.total}
				</h2>
				<p className="mt-1 text-caption text-fire-ink">
					Порог срочности и запас на готовку —{' '}
					<Link
						href={MANAGER_ROUTES.SETTINGS}
						className="font-semibold underline"
					>
						в настройках
					</Link>
					.
				</p>
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
				className="min-w-0 rounded-lg border-2 border-danger/40 bg-danger-tint p-6"
			>
				<div className="flex flex-wrap items-center justify-between gap-2">
					<h2 className="!text-title text-danger">Просрочено · {expiredTotal}</h2>
					{data.autoWrittenOff.items.length > 1 && (
						<Button
							size="sm"
							variant="ghost"
							disabled={read.isPending}
							onClick={() =>
								read.mutate(
									data.autoWrittenOff.items.map((item) => item.messageId)
								)
							}
						>
							Скрыть все
						</Button>
					)}
				</div>
				<ul className="mt-2 max-h-64 overflow-y-auto">
					{data.autoWrittenOff.items.map((item) => (
						<AutoWriteOffSignal
							key={item.messageId}
							item={item}
							disabled={read.isPending}
							onRead={() => read.mutate([item.messageId])}
						/>
					))}
					{data.expired.items.map((batch) => (
						<BatchSignal key={batch.id} batch={batch} />
					))}
				</ul>
				{!expiredTotal && (
					<p className="mt-3 text-caption text-ink-muted">
						Просроченных остатков нет.
					</p>
				)}
				{(data.autoWrittenOff.total > data.limit ||
					data.expired.total > data.limit) && (
					<p className="mt-3 text-caption">
						Показаны первые {data.limit} записей.
					</p>
				)}
			</section>
			<section
				aria-label="Блюда в стоп-листе"
				className="min-w-0 rounded-lg bg-surface-raised p-6 shadow-card"
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
								className="break-words font-semibold text-gold-ink underline"
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
