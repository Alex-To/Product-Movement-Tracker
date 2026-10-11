'use client'

import { errorCatch } from '@/api/api.helper'
import kitchenService from '@/services/kitchen.service'
import type { IStopListDish } from '@/types/kitchen.types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'

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

	return (
		<section>
			<h1 className="mb-2">Стоп-лист</h1>

			{isLoading && <p>Загрузка…</p>}
			{isError && <p>Не удалось загрузить стоп-лист</p>}
			{!isLoading && !isError && !dishes.length && <p>Блюд пока нет</p>}

			{!!dishes.length && (
				<div className="overflow-x-auto">
					<table className="w-full text-left">
						<thead>
							<tr>
								<th className="p-2">Блюдо</th>
								<th className="p-2">Можно порций</th>
								<th className="p-2">Статус</th>
								<th className="p-2">Действие</th>
							</tr>
						</thead>
						<tbody>
							{dishes.map(dish => {
								const hasManual = dish.stops.some(s => s.type === 'MANUAL')

								return (
									<tr
										key={dish.id}
										className="border-t border-zinc-700"
									>
										<td className="p-2">{dish.name}</td>
										<td className="p-2">{dish.portions ?? '—'}</td>
										<td className="p-2">{statusText(dish)}</td>
										<td className="p-2">
											{hasManual ? (
												<button
													type="button"
													disabled={isBusy}
													onClick={() => removeStop(dish.id)}
													className="border border-zinc-600 rounded px-3 py-1"
												>
													Снять стоп
												</button>
											) : (
												<button
													type="button"
													disabled={isBusy}
													onClick={() => setStop(dish.id)}
													className="border border-zinc-600 rounded px-3 py-1"
												>
													Поставить в стоп
												</button>
											)}
										</td>
									</tr>
								)
							})}
						</tbody>
					</table>
				</div>
			)}
		</section>
	)
}
