'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Loading } from '@/components/ui/PizzaLoader'
import { managerError } from '../api/manager.api'
import { catalogInput, catalogLabel } from '../products/styles'
import { restaurantToday, shiftDate } from './statistics.api'
import { StatisticsChart } from './StatisticsChart'
import { ForecastStatistics } from './ForecastStatistics'
import {
	quantity,
	statisticsCard,
	stockStatisticsApi
} from './stock-statistics.api'

function ExpiryHistory({ userId }: { userId: string }) {
	const [period, setPeriod] = useState(() => {
		const to = restaurantToday()
		return { from: shiftDate(to, -6), to }
	})
	const [draft, setDraft] = useState(period),
		[unitId, setUnitId] = useState(''),
		[timeline, setTimeline] = useState(false),
		[error, setError] = useState('')
	const query = useQuery({
		queryKey: [
			'manager',
			'statistics',
			userId,
			'expiry',
			period.from,
			period.to
		],
		queryFn: ({ signal }) => stockStatisticsApi.expiry(period, signal),
		retry: false
	})
	const data = query.data,
		unit = data?.units.find((item) => item.id === unitId) ?? data?.units[0]
	const values = (row: {
		auto: string
		manualExpired: string
		otherManual: string
	}) => [Number(row.auto), Number(row.manualExpired), Number(row.otherManual)]
	return (
		<>
			<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
				<h2>История списаний</h2>
				<Button
					variant="secondary"
					disabled={query.isFetching}
					onClick={() => query.refetch()}
				>
					Обновить
				</Button>
			</div>
			<p className="mb-4 text-ink-muted">
				Просрочка — автоматические списания и ручные списания после окончания
				срока партии. Остальные ручные списания показаны отдельно: их причина не
				записывается.
			</p>
			<form
				className={`${statisticsCard} mb-5`}
				onSubmit={(event) => {
					event.preventDefault()
					if (
						!draft.from ||
						!draft.to ||
						draft.from > draft.to ||
						(Date.parse(draft.to) - Date.parse(draft.from)) / 86400000 >= 366
					) {
						setError('Выберите период от 1 до 366 дней.')
						return
					}
					setError('')
					setPeriod(draft)
				}}
			>
				<div className="mb-4 flex flex-wrap gap-2">
					{[1, 7, 30].map((days) => (
						<Button
							key={days}
							size="sm"
							variant="secondary"
							onClick={() => {
								const to = restaurantToday()
								const next = { from: shiftDate(to, 1 - days), to }
								setDraft(next)
								setPeriod(next)
								setError('')
							}}
						>
							{days === 1 ? 'Сегодня' : `${days} дней`}
						</Button>
					))}
				</div>
				<div className="flex flex-wrap items-end gap-4">
					{(['from', 'to'] as const).map((key) => (
						<label className={catalogLabel} key={key}>
							{key === 'from' ? 'С даты' : 'По дату включительно'}
							<input
								className={catalogInput}
								type="date"
								min="2000-01-01"
								max="2099-12-31"
								required
								value={draft[key]}
								onChange={(event) =>
									setDraft({ ...draft, [key]: event.target.value })
								}
							/>
						</label>
					))}
					<Button type="submit">Показать</Button>
				</div>
				<p className="mt-3 text-caption text-ink-muted">
					Период: {period.from} — {period.to}. Дата фактического списания,
					часовой пояс Europe/Simferopol (UTC+3).
				</p>
				{error && (
					<p role="alert" className="mt-2 text-danger">
						{error}
					</p>
				)}
			</form>
			{query.isPending ? (
				<Loading label="Загрузка истории списаний…" />
			) : query.isError ? (
				<p role="alert" className="rounded-md bg-danger-tint p-4">
					{managerError(query.error)}
				</p>
			) : (
				data && (
					<>
						<p className="mb-4 text-ink-muted">
							Операций: {data.movements}. Партий: {data.batches}. Единицы
							измерения считаются отдельно.
						</p>
						{!unit ? (
							<p className={statisticsCard}>
								За выбранный период списаний нет.
							</p>
						) : (
							<>
								<label className={`${catalogLabel} mb-5 max-w-xs`}>
									Единица измерения
									<select
										className={catalogInput}
										value={unit.id}
										onChange={(event) => setUnitId(event.target.value)}
									>
										{data.units.map((item) => (
											<option key={item.id} value={item.id}>
												{item.name}
											</option>
										))}
									</select>
								</label>
								<section className={`${statisticsCard} mb-5`}>
									<div className="mb-5 flex flex-wrap items-center justify-between gap-3">
										<h2>Списания, {unit.name}</h2>
										<div className="flex gap-2">
											<Button
												size="sm"
												variant={timeline ? 'secondary' : 'primary'}
												aria-pressed={!timeline}
												onClick={() => setTimeline(false)}
											>
												По продуктам
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
										<p className="mb-3 text-caption text-ink-muted">
											Первые 10 продуктов по автосписанию. Все продукты — в
											таблице.
										</p>
									)}
									<StatisticsChart
										title="История списаний"
										timeline={timeline}
										legend={[
											{
												name: 'Автосписание просрочки',
												color: 'var(--danger)'
											},
											{ name: 'Ручное после срока', color: 'var(--gold)' },
											{ name: 'Прочее ручное', color: 'var(--ink-muted)' }
										]}
										rows={
											timeline
												? unit.series.map((row) => ({
														label:
															data.period.bucket === 'hour'
																? row.key
																: `${row.key.slice(8)}.${row.key.slice(5, 7)}`,
														values: values(row)
													}))
												: unit.products
														.slice(0, 10)
														.map((row) => ({
															label: row.name,
															values: values(row)
														}))
										}
									/>
								</section>
								<section className={statisticsCard}>
									<h2 className="mb-4">Точные значения, {unit.name}</h2>
									<div className="max-h-[600px] overflow-auto">
										<table className="w-full text-left text-caption">
											<thead className="border-b border-border text-ink-muted">
												<tr>
													{[
														timeline ? 'Период' : 'Продукт',
														'Автосписание',
														'Ручное после срока',
														'Прочее ручное'
													].map((label) => (
														<th
															key={label}
															scope="col"
															className="px-3 py-3 font-semibold"
														>
															{label}
														</th>
													))}
												</tr>
											</thead>
											<tbody>
												{(timeline
													? unit.series.map((row) => ({
															...row,
															id: row.key,
															name: row.key
														}))
													: unit.products
												).map((row) => (
													<tr key={row.id} className="border-b border-border">
														<th scope="row" className="px-3 py-3 font-normal">
															{row.name}
														</th>
														{values(row).map((value, index) => (
															<td
																key={index}
																className="px-3 py-3 tabular-nums"
															>
																{quantity(value)}
															</td>
														))}
													</tr>
												))}
											</tbody>
										</table>
									</div>
								</section>
							</>
						)}
					</>
				)
			)}
		</>
	)
}

export function ExpiryStatistics({ userId }: { userId: string }) {
	const [forecast, setForecast] = useState(false)
	return (
		<>
			<div className="mb-5 flex gap-3">
				<Button
					variant={forecast ? 'secondary' : 'primary'}
					aria-pressed={!forecast}
					onClick={() => setForecast(false)}
				>
					История
				</Button>
				<Button
					variant={forecast ? 'primary' : 'secondary'}
					aria-pressed={forecast}
					onClick={() => setForecast(true)}
				>
					Прогноз
				</Button>
			</div>
			{forecast ? (
				<ForecastStatistics userId={userId} expiry />
			) : (
				<ExpiryHistory userId={userId} />
			)}
		</>
	)
}
