'use client'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Loading } from '@/components/ui/PizzaLoader'
import { managerError } from '../api/manager.api'
import { MANAGER_ROUTES } from '../config/manager.routes'
import { StatisticsChart } from './StatisticsChart'
import {
	quantity,
	statisticsCard,
	statisticsDate,
	stockStatisticsApi
} from './stock-statistics.api'
import { formatManualHotUntil } from '../dishes/manual-hot-time'

export function HotStatistics({ userId }: { userId: string }) {
	const query = useQuery({
		queryKey: ['manager', 'statistics', userId, 'hot'],
		queryFn: ({ signal }) => stockStatisticsApi.hot(signal),
		retry: false,
		refetchInterval: 15000,
		staleTime: 0
	})
	const data = query.data,
		items = data?.items.filter((item) => item.isHot) ?? []
	return (
		<>
			<div className="mb-5 flex flex-wrap items-start justify-between gap-3">
				<div>
					<h2>Горячие предложения</h2>
					<p className="mt-2 text-ink-muted">
						Текущий список по сохранённым настройкам менеджера. Обновляется
						каждые 15 секунд.
					</p>
					<Link
						className="mt-2 inline-block font-semibold text-gold-ink underline"
						href={MANAGER_ROUTES.SETTINGS}
					>
						Настроить горячие предложения
					</Link>
					<Link
						className="ml-4 mt-2 inline-block font-semibold text-gold-ink underline"
						href={MANAGER_ROUTES.DISHES}
					>
						Назначить вручную в каталоге
					</Link>
				</div>
				<Button
					variant="secondary"
					disabled={query.isFetching}
					onClick={() => query.refetch()}
				>
					Обновить
				</Button>
			</div>
			<p className="mb-5 text-caption text-ink-muted">
				Ручные назначения менеджера и автоматические предложения по срокам,
				остаткам и спросу. В списке только доступные блюда; ручные идут первыми.
			</p>
			{query.isPending ? (
				<Loading label="Загрузка горячих предложений…" />
			) : query.isError ? (
				<p role="alert" className="rounded-md bg-danger-tint p-4">
					{managerError(query.error)}
				</p>
			) : (
				data && (
					<>
						<p className="mb-4 text-caption text-ink-muted">
							Автоматический лимит: {data.hotLimit}. Ручных: {data.manualCount}.
							Период спроса: {data.demandDays} дн. Обновлено:{' '}
							{statisticsDate(data.generatedAt)}.
						</p>
						{!data.hasDemand && (
							<p className="mb-5 rounded-md bg-tint p-4 text-caption">
								Нет истории спроса: существующий алгоритм горячих предложений
								предполагает продажу всех доступных порций. Прогноз закупок
								использует отдельную оценку достаточности данных.
							</p>
						)}
						<section className={`${statisticsCard} mb-5`}>
							<h2 className="mb-4">Доступные порции горячих блюд</h2>
							<StatisticsChart
								title="Горячие предложения"
								timeline={false}
								legend={[{ name: 'Порций сейчас', color: 'var(--gold)' }]}
								rows={items.map((item) => ({
									label: item.name,
									values: [item.portions]
								}))}
							/>
							<p className="mt-3 text-caption text-ink-muted">
								Порции рассчитаны для каждого блюда отдельно. Общие ингредиенты
								нельзя одновременно потратить на все блюда.
							</p>
						</section>
						{!items.length ? (
							<p className={statisticsCard}>Сейчас горячих предложений нет.</p>
						) : (
							<ol className="grid gap-4 md:grid-cols-2">
								{items.map((item) => (
									<li key={item.id} className={statisticsCard}>
										<h3 className="text-lg font-semibold">{item.name}</h3>
										<p className="mt-2 text-caption text-ink-muted">
											{item.hotSource === 'MANUAL' ? (
												<>
													{item.manualHotUntil
														? `Вручную до ${formatManualHotUntil(item.manualHotUntil)}`
														: 'Вручную · без срока'}{' '}
													· Порций: {item.portions}
												</>
											) : (
												<>
													Порций: {item.portions} · Приоритет:{' '}
													{item.score.toLocaleString('ru-RU', {
														maximumSignificantDigits: 3
													})}
													{item.salesPerDay !== null &&
														` · Спрос: ${quantity(item.salesPerDay)} порц./сутки`}
												</>
											)}
										</p>
										<ul className="mt-4 space-y-3 text-caption">
											{item.hotSource !== 'MANUAL' &&
												item.reasons.map((reason, index) => (
													<li key={index}>
														<b>{reason.productName}</b>: срочный остаток{' '}
														{quantity(reason.atRisk)} {reason.unit}; блюдо может
														использовать {quantity(reason.saves)} {reason.unit}.
														<br />
														<span className="text-ink-muted">
															Ближайший срок:{' '}
															{statisticsDate(reason.nearestExpiry)}
														</span>
													</li>
												))}
										</ul>
									</li>
								))}
							</ol>
						)}
					</>
				)
			)}
		</>
	)
}
