'use client'

import { errorCatch } from '@/api/api.helper'
import { Button } from '@/components/ui/Button'
import { Loading } from '@/components/ui/PizzaLoader'
import kitchenService from '@/services/kitchen.service'
import type { IStopListDish } from '@/types/kitchen.types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { twMerge } from '@/utils/tw-merge'

const statusText = (dish: IStopListDish) => {
	const auto = dish.stops.find(s => s.type === 'AUTO')
	const manual = dish.stops.find(s => s.type === 'MANUAL')
	const parts: string[] = []

	if (auto) {
		parts.push(
			`СТОП авто${dish.missing.length ? ` (нет: ${dish.missing.join(', ')})` : ''}`
		)
	}
	if (manual) {
		parts.push(`СТОП вручную${manual.createrName ? ` (${manual.createrName})` : ''}`)
	}

	return parts.length ? parts.join(' + ') : 'в меню'
}

const StatusChip = ({ dish }: { dish: IStopListDish }) => (
	<span
		className={twMerge(
			'inline-block rounded-full px-3 py-1 text-caption font-semibold',
			dish.stops.length ? 'bg-danger-tint text-danger' : 'bg-tint text-ink'
		)}
	>
		{statusText(dish)}
	</span>
)

export function StopList() {
	const queryClient = useQueryClient()

	const { data, isLoading, isError } = useQuery({
		queryKey: ['kitchen', 'stop-list'],
		queryFn: () => kitchenService.fetchStopList(),
		refetchInterval: 5000
	})

	const onSuccess = () =>
		queryClient.invalidateQueries({ queryKey: ['kitchen', 'stop-list'] })
	const onError = (error: Error) => toast.error(errorCatch(error))

	const { mutate: setStop, isPending: isSetting } = useMutation({
		mutationKey: ['kitchen', 'stop-list', 'set'],
		mutationFn: (dishId: string) => kitchenService.setManualStop(dishId),
		onSuccess,
		onError
	})

	const { mutate: removeStop, isPending: isRemoving } = useMutation({
		mutationKey: ['kitchen', 'stop-list', 'remove'],
		mutationFn: (dishId: string) => kitchenService.removeManualStop(dishId),
		onSuccess,
		onError
	})

	const dishes = data?.data ?? []
	const isBusy = isSetting || isRemoving

	const action = (dish: IStopListDish) =>
		dish.stops.some(s => s.type === 'MANUAL') ? (
			<Button
				size="sm"
				className="min-h-10"
				disabled={isBusy}
				onClick={() => removeStop(dish.id)}
			>
				Снять стоп
			</Button>
		) : (
			<Button
				variant="secondary"
				size="sm"
				className="min-h-10"
				disabled={isBusy}
				onClick={() => setStop(dish.id)}
			>
				Поставить в стоп
			</Button>
		)

	return (
		<section className="flex flex-col gap-6">
			<h1>Стоп-лист</h1>

			{isLoading && (
				<Loading size={96} />
			)}
			{isError && <p className="text-danger">Не удалось загрузить стоп-лист</p>}
			{!isLoading && !isError && !dishes.length && (
				<p className="text-ink-muted">Блюд пока нет</p>
			)}

			{!!dishes.length && (
				<>
					{/* Телефон: карточки */}
					<ul className="flex flex-col gap-3 sm:hidden">
						{dishes.map(dish => (
							<li
								key={dish.id}
								className={twMerge(
									'flex items-center gap-3 rounded-lg p-4 shadow-card',
									dish.stops.length ? 'bg-danger-tint/40' : 'bg-surface-raised'
								)}
							>
								<div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
									<b>{dish.name}</b>
									<span className="text-caption text-ink-muted">
										Можно порций: {dish.portions ?? '—'}
									</span>
									<StatusChip dish={dish} />
								</div>
								{action(dish)}
							</li>
						))}
					</ul>

					{/* Планшет и компьютер: таблица */}
					<div className="hidden overflow-x-auto rounded-lg bg-surface-raised shadow-card sm:block">
						<table className="w-full min-w-[620px] border-collapse text-left">
							<thead className="text-caption font-semibold text-ink-muted">
								<tr>
									<th className="px-6 pt-5 pb-3">Блюдо</th>
									<th className="px-4 pt-5 pb-3">Можно порций</th>
									<th className="px-4 pt-5 pb-3">Статус</th>
									<th className="px-6 pt-5 pb-3">Действие</th>
								</tr>
							</thead>
							<tbody>
								{dishes.map(dish => (
									<tr
										key={dish.id}
										className={twMerge(
											'border-t border-tint',
											dish.stops.length && 'bg-danger-tint/40'
										)}
									>
										<td className="px-6 py-3 font-semibold">{dish.name}</td>
										<td className="px-4 py-3 font-mono">{dish.portions ?? '—'}</td>
										<td className="px-4 py-3">
											<StatusChip dish={dish} />
										</td>
										<td className="px-6 py-2">{action(dish)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</>
			)}
		</section>
	)
}
