'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Loading } from '@/components/ui/PizzaLoader'
import { ManagerAccess } from '../components/ManagerAccess'
import { managerError } from '../api/manager.api'
import { catalogInput, catalogLabel } from '../products/styles'
import {
	Period,
	restaurantToday,
	Section,
	shiftDate,
	statisticsApi
} from './statistics.api'
import { StatisticsChart } from './StatisticsChart'
import { ExpiryStatistics } from './ExpiryStatistics'
import { ForecastStatistics } from './ForecastStatistics'
import { HotStatistics } from './HotStatistics'

const format = (value: number) => value.toLocaleString('ru-RU')
const card = 'rounded-lg border border-border bg-surface-raised p-5 sm:p-6'

function Workspace({ userId }: { userId: string }) {
	const [section, setSection] = useState<
		Section | 'expiry' | 'purchase' | 'hot'
	>('sales')
	const historical = section === 'sales' || section === 'rejections'
	const [period, setPeriod] = useState<Period>(() => {
		const to = restaurantToday()
		return { from: shiftDate(to, -6), to }
	})
	const [draft, setDraft] = useState(period)
	const [error, setError] = useState('')
	const [timeline, setTimeline] = useState(false)
	const [allDishes, setAllDishes] = useState(false)
	const query = useQuery({
		queryKey: [
			'manager',
			'statistics',
			userId,
			section === 'rejections' ? 'rejections' : 'sales',
			period.from,
			period.to
		],
		queryFn: ({ signal }) =>
			statisticsApi.get(
				section === 'rejections' ? 'rejections' : 'sales',
				period,
				signal
			),
		enabled: historical,
		retry: false
	})
	const sales = section === 'sales',
		data = query.data
	function apply(value: Period) {
		const from = new Date(`${value.from}T00:00:00Z`),
			to = new Date(`${value.to}T00:00:00Z`)
		if (
			!Number.isFinite(+from) ||
			!Number.isFinite(+to) ||
			value.from < '2000-01-01' ||
			value.to > '2099-12-31' ||
			from > to ||
			(+to - +from) / 86400000 >= 366
		) {
			setError('Выберите корректный период: от 1 до 366 дней.')
			return
		}
		setError('')
		setPeriod(value)
		setDraft(value)
	}
	const legend = sales
		? [{ name: 'Принято порций', color: 'var(--gold)' }]
		: [
				{ name: 'Стоп-лист', color: 'var(--gold)' },
				{ name: 'Нехватка продуктов', color: 'var(--danger)' },
				...(timeline
					? [{ name: 'Технический отказ', color: 'var(--ink-muted)' }]
					: [])
			]
	const rows = !data
		? []
		: timeline
			? data.series.map((point) => ({
					label:
						data.period.bucket === 'hour'
							? point.key
							: `${point.key.slice(8, 10)}.${point.key.slice(5, 7)}`,
					values: sales
						? [point.portions]
						: [point.stopList ?? 0, point.shortage ?? 0, point.busy ?? 0]
				}))
			: (allDishes ? data.dishes : data.dishes.slice(0, 10)).map((dish) => ({
					label: dish.name,
					values: sales
						? [dish.portions]
						: [dish.stopList ?? 0, dish.shortage ?? 0]
				}))
	return (
		<>
			<div className="mb-6 flex flex-wrap items-start justify-between gap-4">
				<div>
					<h1>
						Статистика <span className="title-accent">ресторана</span>
					</h1>
					<p className="mt-3 text-ink-muted">
						Продажи, отказы, просрочка и планирование закупок.
					</p>
				</div>
				{historical && (
					<Button
						variant="secondary"
						disabled={query.isFetching}
						onClick={() => query.refetch()}
					>
						Обновить
					</Button>
				)}
			</div>
			<div className="mb-6 flex flex-wrap gap-3" aria-label="Раздел статистики">
				{(['sales', 'rejections', 'expiry', 'purchase', 'hot'] as const).map(
					(value) => (
						<Button
							key={value}
							variant={section === value ? 'primary' : 'secondary'}
							aria-pressed={section === value}
							onClick={() => setSection(value)}
						>
							{
								{
									sales: 'Продажи',
									rejections: 'Отказы',
									expiry: 'Просрочка',
									purchase: 'Что заказать',
									hot: 'Горячие предложения'
								}[value]
							}
						</Button>
					)
				)}
			</div>
			{section === 'expiry' ? (
				<ExpiryStatistics userId={userId} />
			) : section === 'purchase' ? (
				<ForecastStatistics userId={userId} />
			) : section === 'hot' ? (
				<HotStatistics userId={userId} />
			) : (
				<>
					<section className={`${card} mb-6`} aria-label="Период статистики">
						<div className="mb-4 flex flex-wrap gap-2">
							{[1, 7, 30].map((days) => (
								<Button
									key={days}
									size="sm"
									variant="secondary"
									onClick={() => {
										const to = restaurantToday()
										apply({ from: shiftDate(to, 1 - days), to })
									}}
								>
									{days === 1 ? 'Сегодня' : `${days} дней`}
								</Button>
							))}
						</div>
						<form
							className="flex flex-wrap items-end gap-4"
							onSubmit={(event) => {
								event.preventDefault()
								apply(draft)
							}}
						>
							{(['from', 'to'] as const).map((key) => (
								<label key={key} className={catalogLabel}>
									{key === 'from' ? 'С даты' : 'По дату включительно'}
									<input
										className={catalogInput}
										type="date"
										required
										min="2000-01-01"
										max="2099-12-31"
										value={draft[key]}
										onChange={(event) =>
											setDraft({ ...draft, [key]: event.target.value })
										}
									/>
								</label>
							))}
							<Button type="submit">Показать</Button>
						</form>
						<p className="mt-3 text-caption text-ink-muted">
							Часовой пояс ресторана: Europe/Simferopol (UTC+3). Период до 366
							дней.
						</p>
						{error && (
							<p role="alert" className="mt-3 text-danger">
								{error}
							</p>
						)}
					</section>
					<h2 className="mb-3">
						{sales ? 'Продажи блюд' : 'Отказы в продаже'}
					</h2>
					<p className="mb-5 text-ink-muted">
						{sales
							? 'Считаем порции в принятых заказах по дате создания заказа. Оплата и готовность блюда не учитываются.'
							: 'Считаем зарегистрированные попытки заказа и запрошенные порции заблокированных блюд. Повторная попытка — отдельный отказ, а не новая потерянная продажа.'}
					</p>
					{query.isPending ? (
						<Loading label="Загрузка статистики…" />
					) : query.isError ? (
						<div role="alert" className="rounded-md bg-danger-tint p-5">
							<p>{managerError(query.error)}</p>
							<Button
								className="mt-3"
								variant="secondary"
								onClick={() => query.refetch()}
							>
								Повторить
							</Button>
						</div>
					) : (
						data && (
							<>
								<p className="mb-4 text-caption text-ink-muted">
									Период: {period.from.split('-').reverse().join('.')} —{' '}
									{period.to.split('-').reverse().join('.')}
								</p>
								<div className="mb-6 grid gap-4 sm:grid-cols-3">
									{(sales
										? [
												['Принято порций', data.summary.portions],
												['Заказов', data.summary.orders ?? 0],
												['Разных блюд', data.summary.dishes ?? 0]
											]
										: [
												[
													'Отказов по стоп-листу',
													data.summary.byReason?.STOP_LIST ?? 0
												],
												[
													'Отказов из-за нехватки',
													data.summary.byReason?.SHORTAGE ?? 0
												],
												['Заблокировано порций', data.summary.portions]
											]
									).map(([label, value]) => (
										<div key={label} className={card}>
											<p className="text-caption text-ink-muted">{label}</p>
											<p className="mt-3 text-3xl font-semibold">
												{format(Number(value))}
											</p>
										</div>
									))}
								</div>
								{!sales && (
									<div className="mb-6 rounded-md bg-tint p-4 text-caption">
										<p>
											Всего попыток с отказом:{' '}
											{format(data.summary.attempts ?? 0)}. Технических отказов:{' '}
											{format(data.summary.byReason?.BUSY ?? 0)} — в порции по
											блюдам не включены.
										</p>
										<p className="mt-2">
											В порции входят только заблокированные позиции, а не вся
											корзина. Это запрошенное количество, а не величина
											нехватки.
										</p>
										{!!data.summary.incompleteAttempts && (
											<p className="mt-2">
												У {format(data.summary.incompleteAttempts)} отказов
												неполные сведения о заблокированных позициях. Их порции
												учтены только там, где блокировка известна.
											</p>
										)}
									</div>
								)}
								<section
									className={`${card} mb-6 min-w-0`}
									aria-label="График статистики"
								>
									<div className="mb-5 flex flex-wrap items-center justify-between gap-3">
										<h2>
											{timeline
												? sales
													? 'Порции по времени'
													: 'Попытки отказа по времени'
												: 'Порции по блюдам'}
										</h2>
										<div className="flex flex-wrap gap-2">
											<Button
												size="sm"
												variant={!timeline ? 'primary' : 'secondary'}
												aria-pressed={!timeline}
												onClick={() => setTimeline(false)}
											>
												По блюдам
											</Button>
											<Button
												size="sm"
												variant={timeline ? 'primary' : 'secondary'}
												aria-pressed={timeline}
												onClick={() => setTimeline(true)}
											>
												По времени
											</Button>
										</div>
									</div>
									{!timeline && (
										<label className="mb-4 flex items-center gap-2 text-caption">
											<input
												type="checkbox"
												checked={allDishes}
												onChange={(event) => setAllDishes(event.target.checked)}
											/>
											Все блюда (по умолчанию — первые 10)
										</label>
									)}
									<StatisticsChart
										rows={rows}
										legend={legend}
										timeline={timeline}
										title={sales ? 'Продажи блюд' : 'Отказы в продаже'}
									/>
								</section>
								<section className={`${card} min-w-0`}>
									<h2 className="mb-4">
										{timeline ? 'Данные по времени' : 'Все блюда за период'}
									</h2>
									<div className="max-h-[600px] overflow-auto">
										<table className="w-full text-left text-caption">
											<caption className="sr-only">
												{sales ? 'Принятые порции' : 'Отказы'} за выбранный
												период
											</caption>
											<thead className="border-b border-border text-ink-muted">
												<tr>
													{(timeline
														? [
																'Период',
																sales ? 'Порций' : 'Попыток',
																...(sales
																	? ['Заказов']
																	: ['Стоп-лист', 'Нехватка', 'Технические'])
															]
														: [
																'Блюдо',
																'Порций',
																sales ? 'Заказов' : 'Попыток',
																...(!sales
																	? ['Стоп-лист, порций', 'Нехватка, порций']
																	: [])
															]
													).map((label) => (
														<th
															key={label}
															scope="col"
															className="whitespace-nowrap px-3 py-3 font-semibold"
														>
															{label}
														</th>
													))}
												</tr>
											</thead>
											<tbody>
												{timeline
													? data.series.map((point) => (
															<tr
																key={point.key}
																className="border-b border-border"
															>
																<th
																	scope="row"
																	className="px-3 py-3 font-normal whitespace-nowrap"
																>
																	{point.key}
																</th>
																{(sales
																	? [point.portions, point.orders ?? 0]
																	: [
																			point.attempts ?? 0,
																			point.stopList ?? 0,
																			point.shortage ?? 0,
																			point.busy ?? 0
																		]
																).map((value, index) => (
																	<td
																		key={index}
																		className="px-3 py-3 tabular-nums"
																	>
																		{format(value)}
																	</td>
																))}
															</tr>
														))
													: data.dishes.map((dish) => (
															<tr
																key={dish.dishId}
																className="border-b border-border"
															>
																<th
																	scope="row"
																	className="min-w-40 px-3 py-3 font-normal break-words"
																>
																	{dish.name}
																	{dish.archived && (
																		<span className="ml-2 text-ink-muted">
																			(в корзине)
																		</span>
																	)}
																</th>
																{[
																	dish.portions,
																	sales
																		? (dish.orders ?? 0)
																		: (dish.attempts ?? 0),
																	...(!sales
																		? [dish.stopList ?? 0, dish.shortage ?? 0]
																		: [])
																].map((value, index) => (
																	<td
																		key={index}
																		className="px-3 py-3 tabular-nums"
																	>
																		{format(value)}
																	</td>
																))}
															</tr>
														))}
											</tbody>
										</table>
										{!timeline && !data.dishes.length && (
											<p className="py-6 text-center text-ink-muted">
												Нет блюд с учтёнными порциями за этот период.
											</p>
										)}
									</div>
									<p className="mt-4 text-caption text-ink-muted">
										Обновлено:{' '}
										{new Date(data.generatedAt).toLocaleString('ru-RU', {
											timeZone: data.period.timeZone
										})}
									</p>
								</section>
							</>
						)
					)}
				</>
			)}
		</>
	)
}

export function StatisticsWorkspace() {
	return (
		<ManagerAccess>{(userId) => <Workspace userId={userId} />}</ManagerAccess>
	)
}
