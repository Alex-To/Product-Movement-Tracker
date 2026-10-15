'use client'
import { Loading } from '@/components/ui/PizzaLoader'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { TbFlame } from 'react-icons/tb'
import { managerError } from '../api/manager.api'
import {
	type RestaurantSettings,
	settingsApi,
	settingsKeys
} from './settings.api'
import { formatManualHotUntil } from '../dishes/manual-hot-time'

const formatQuantity = (value: string) =>
	new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(
		Number(value)
	)

const formatDate = (value: string) =>
	new Date(value).toLocaleString('ru-RU', {
		dateStyle: 'short',
		timeStyle: 'short'
	})

// Пока менеджер печатает, не дёргаем сервер на каждую цифру
function useDebounced<T>(value: T, delayMs: number) {
	const [debounced, setDebounced] = useState(value)
	useEffect(() => {
		const id = setTimeout(() => setDebounced(value), delayMs)
		return () => clearTimeout(id)
	}, [value, delayMs])
	return debounced
}

/**
 * Какие блюда горячие прямо сейчас и почему — по настройкам из формы,
 * ещё до сохранения. Официант видит только отметку, объяснение — здесь
 */
export function HotPreview({
	userId,
	settings
}: {
	userId: string
	settings: RestaurantSettings
}) {
	const debounced = useDebounced(settings, 400)
	const query = useQuery({
		queryKey: settingsKeys.hotPreview(userId, debounced),
		queryFn: () => settingsApi.hotPreview(debounced),
		retry: false,
		refetchInterval: 15000,
		placeholderData: (previous) => previous
	})

	return (
		<div className="mt-6 border-t border-border pt-5">
			<h3 className="font-semibold">Сейчас горячие</h3>
			<p className="mt-1 text-caption text-ink-muted">
				Приоритет блюда — сумма по продуктам: срочность × доля срочного остатка,
				которую блюдо успеет израсходовать до конца срока при своём темпе
				продаж. Популярное блюдо продаётся быстрее и спасает больше. Отметку
				получают первые блюда с приоритетом больше нуля. Ручные назначения из
				каталога показываются первыми сверх лимита и не участвуют в
				автоматической квоте.
			</p>
			{query.data && !query.data.hasDemand && (
				<p className="mt-2 text-caption text-ink-muted">
					За {query.data.demandDays} дн заказов не было — считаем, что продадут
					все порции, которые можно приготовить.
				</p>
			)}
			{query.isPending ? (
				<Loading size={32} label="Считаем приоритеты…" className="py-4" />
			) : query.isError ? (
				<p role="alert" className="mt-3 text-caption text-danger">
					{managerError(query.error)}
				</p>
			) : !query.data.items.length ? (
				<p className="mt-3 text-caption text-ink-muted">
					Нет доступных ручных предложений и автоматических кандидатов.
				</p>
			) : (
				<ol className="mt-3 space-y-3">
					{query.data.items.map((dish) => (
						<li
							key={dish.id}
							className={
								dish.isHot
									? 'rounded-md bg-fire-tint p-3 text-fire-ink'
									: 'rounded-md bg-tint p-3 text-ink-muted'
							}
						>
							<div className="flex flex-wrap items-center justify-between gap-2">
								<span className="flex items-center gap-1.5 font-semibold">
									{dish.isHot && (
										<TbFlame size={18} role="img" aria-label="Горячее" />
									)}
									{dish.name}
								</span>
								<span className="font-mono text-caption">
									{dish.hotSource === 'MANUAL' ? (
										dish.manualHotUntil ? (
											`Вручную до ${formatManualHotUntil(dish.manualHotUntil)}`
										) : (
											'Вручную · без срока'
										)
									) : (
										<>
											приоритет {dish.score.toLocaleString('ru-RU')} · можно{' '}
											{dish.portions}
											{dish.salesPerDay !== null &&
												` · ~${dish.salesPerDay.toLocaleString('ru-RU')} в день`}
										</>
									)}
								</span>
							</div>
							<ul className="mt-1 space-y-0.5 text-caption">
								{dish.hotSource !== 'MANUAL' &&
									dish.reasons.map((reason) => (
										<li key={reason.productName} className="break-words">
											{reason.productName}: под угрозой{' '}
											{formatQuantity(reason.atRisk)} {reason.unit}, срок{' '}
											{formatDate(reason.nearestExpiry)} — до срока блюдо
											израсходует {formatQuantity(reason.saves)} {reason.unit}
										</li>
									))}
							</ul>
							{!dish.isHot && (
								<p className="mt-1 text-caption">
									На подходе: не вошло в лимит
								</p>
							)}
						</li>
					))}
				</ol>
			)}
			{query.data &&
				query.data.candidates >
					query.data.items.filter((item) => item.hotSource !== 'MANUAL')
						.length && (
					<p className="mt-2 text-caption text-ink-muted">
						Всего блюд с приоритетом: {query.data.candidates}
					</p>
				)}
		</div>
	)
}
