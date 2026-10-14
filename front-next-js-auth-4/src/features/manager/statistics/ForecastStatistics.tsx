'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Loading } from '@/components/ui/PizzaLoader'
import { managerError } from '../api/manager.api'
import { catalogInput, catalogLabel } from '../products/styles'
import { StatisticsChart } from './StatisticsChart'
import {
	quantity,
	statisticsCard,
	statisticsDate,
	stockStatisticsApi
} from './stock-statistics.api'

const statuses = {
	fresh: 'Свежая',
	urgent: 'Срочная',
	unusable: 'Не успеть приготовить',
	expired: 'Просрочена'
}

export function ForecastStatistics({
	userId,
	expiry = false
}: {
	userId: string
	expiry?: boolean
}) {
	const [days, setDays] = useState(14),
		[includeRejections, setIncludeRejections] = useState(false),
		[search, setSearch] = useState('')
	const query = useQuery({
		queryKey: [
			'manager',
			'statistics',
			userId,
			'forecast',
			days,
			includeRejections
		],
		queryFn: ({ signal }) =>
			stockStatisticsApi.forecast(days, includeRejections, signal),
		retry: false
	})
	const data = query.data
	const units = [
		...new Map(
			(data?.products ?? []).map((item) => [item.unitId, item.unit])
		).entries()
	]
	const products = (data?.products ?? [])
		.filter(
			(item) =>
				item.name
					.toLocaleLowerCase('ru-RU')
					.includes(search.toLocaleLowerCase('ru-RU')) &&
				(!expiry ||
					[item.atRisk, item.expired, item.unusable].some(
						(value) => Number(value) > 0
					))
		)
		.sort(
			(a, b) =>
				Number(expiry ? b.expectedLoss : b.toOrder) -
					Number(expiry ? a.expectedLoss : a.toOrder) ||
				a.name.localeCompare(b.name)
		)
	const metric = expiry ? 'expectedLoss' : 'toOrder'
	return (
		<div>
			<div className="mb-5 flex flex-wrap items-start justify-between gap-3">
				<div>
					<h2>{expiry ? 'Прогноз просрочки' : 'Что заказать'}</h2>
					<p className="mt-2 text-ink-muted">
						{expiry
							? 'Остатки, которые предположительно не успеют использовать до границы приготовления.'
							: 'Сколько продукта понадобится дополнительно на выбранный срок с учётом годности партий.'}
					</p>
				</div>
				<Button
					variant="secondary"
					disabled={query.isFetching}
					onClick={() => query.refetch()}
				>
					Обновить
				</Button>
			</div>
			<div className={`${statisticsCard} mb-5`}>
				<div className="flex flex-wrap items-center gap-3">
					<span className="font-semibold">Горизонт прогноза</span>
					{[1, 3, 7, 14].map((value) => (
						<Button
							key={value}
							size="sm"
							aria-pressed={days === value}
							variant={days === value ? 'primary' : 'secondary'}
							onClick={() => setDays(value)}
						>
							{value === 1
								? '1 день'
								: `${value} ${value === 3 ? 'дня' : 'дней'}`}
						</Button>
					))}
				</div>
				<label className="mt-4 flex items-center gap-2 text-caption">
					<input
						type="checkbox"
						checked={includeRejections}
						onChange={(event) => setIncludeRejections(event.target.checked)}
					/>
					Учитывать неудовлетворённый спрос
				</label>
				<p className="mt-2 text-caption text-ink-muted">
					Повторные отказы могут завышать спрос. Технические отказы не
					учитываются.
				</p>
			</div>
			{query.isPending ? (
				<Loading label="Рассчитываем прогноз…" />
			) : query.isError ? (
				<p role="alert" className="rounded-md bg-danger-tint p-4">
					{managerError(query.error)}
				</p>
			) : (
				data && (
					<>
						<div className="mb-5 rounded-md bg-tint p-4 text-caption text-ink-muted">
							<p>
								История спроса: {data.demandDays} полных завершённых дней — из
								настроек менеджера. С {statisticsDate(data.historyFrom)} до{' '}
								{statisticsDate(data.historyUntil)} (не включая границу
								окончания). Сегодняшние заказы не учитываются; дни без продаж
								входят в среднее. Расчёт на {statisticsDate(data.generatedAt)},
								до {statisticsDate(data.until)} (UTC+3). Запас на приготовление:{' '}
								{data.cookReserveMinutes} мин.
							</p>
							<p className="mt-2">
								Средний расход по текущим рецептам при сохранении спроса и
								доступности остальных ингредиентов. Общие продукты суммируются
								по всем блюдам; партии расходуются по ближайшему сроку. Будущие
								поставки не учитываются. Расчёт по полным рецептам, без
								исключений ингредиентов в отдельных заказах.
							</p>
							<p className="mt-2">
								Закупка = ожидаемая потребность − количество, которое успеем
								взять из текущих партий. Прогноз не создаёт заказ поставщику.
								Для продуктов без наблюдаемого спроса количество не назначается.{' '}
								Закупка в штуках округляется вверх до целого, в остальных
								единицах — до трёх знаков.
							</p>
							{data.observationHours === null && (
								<p className="mt-2 text-gold-ink">
									Недостаточно истории по действующим рецептам. Пока показаны
									только фактические остатки и сроки.
								</p>
							)}
						</div>
						{!units.length ? (
							<p className={statisticsCard}>
								В справочнике пока нет продуктов.
							</p>
						) : (
							<>
								<div className="mb-5 flex flex-wrap gap-4">
									<label className={`${catalogLabel} flex-1`}>
										Поиск продукта
										<input
											className={catalogInput}
											type="search"
											value={search}
											onChange={(event) => setSearch(event.target.value)}
											placeholder="Название продукта"
										/>
									</label>
								</div>
								{units
									.filter(([id]) =>
										products.some((product) => product.unitId === id)
									)
									.map(([id, unit]) => (
										<section key={id} className={`${statisticsCard} mb-5`}>
											<h2 className="mb-4">
												{expiry
													? 'Ожидаемый неиспользованный остаток'
													: 'Рекомендуемая закупка'}
												, {unit}
											</h2>
											<p className="mb-4 text-caption text-ink-muted">
												Первые 10 продуктов с наибольшим количеством. Все
												значения — в таблице ниже.
												{expiry &&
													' Уже просроченные и непригодные для готовки партии показаны отдельно в таблице.'}
											</p>
											<StatisticsChart
												title={`${expiry ? 'Прогноз просрочки' : 'Рекомендуемая закупка'}, ${unit}`}
												timeline={false}
												legend={[
													{
														name: `${expiry ? 'Не успеем использовать' : 'К закупке'}, ${unit}`,
														color: expiry ? 'var(--danger)' : 'var(--gold)'
													}
												]}
												rows={products
													.filter((product) => product.unitId === id)
													.filter((product) => product[metric] !== null)
													.slice(0, 10)
													.map((product) => ({
														label: product.name,
														values: [Number(product[metric])]
													}))}
											/>
										</section>
									))}
								<section className={statisticsCard}>
									<h2 className="mb-4">Продукты</h2>
									<div className="overflow-auto">
										<table className="w-full text-left text-caption">
											<thead className="border-b border-border text-ink-muted">
												<tr>
													{(expiry
														? [
																'Продукт',
																'Годно сейчас',
																'Срок готовки закончится',
																'Не успеем использовать',
																'Уже нельзя готовить',
																'Уже просрочено'
															]
														: [
																'Продукт',
																'Годно сейчас',
																'Расход в сутки',
																'Потребность',
																'Возьмём из остатка',
																'Заказать'
															]
													).map((label) => (
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
												{products.map((product) => (
													<tr
														key={product.id}
														className="border-b border-border"
													>
														<th
															scope="row"
															className="min-w-52 px-3 py-3 text-left font-normal"
														>
															<span className="font-semibold">
																{product.name}
															</span>
															{product.batches.length > 0 && (
																<details className="mt-2 text-caption text-ink-muted">
																	<summary className="cursor-pointer">
																		Партии: {product.batches.length}
																	</summary>
																	<ul className="mt-2 space-y-3">
																		{product.batches.map((batch) => (
																			<li key={batch.id}>
																				{quantity(batch.quantity)}{' '}
																				{product.unit} ·{' '}
																				{statuses[batch.status]}
																				<br />
																				Годен до{' '}
																				{statisticsDate(batch.expiresAt)}
																				<br />
																				Готовить до{' '}
																				{statisticsDate(batch.usableUntil)}
																				{expiry && (
																					<>
																						<br />
																						Не успеем использовать:{' '}
																						{quantity(batch.expectedLoss)}
																						{batch.expectedLoss !== null &&
																							` ${product.unit}`}
																					</>
																				)}
																			</li>
																		))}
																	</ul>
																</details>
															)}
														</th>
														{(expiry
															? [
																	product.usable,
																	product.atRisk,
																	product.expectedLoss,
																	product.unusable,
																	product.expired
																]
															: [
																	product.usable,
																	product.dailyDemand,
																	product.demand,
																	product.expectedUse,
																	product.toOrder
																]
														).map((value, index) => (
															<td
																key={index}
																className="px-3 py-3 tabular-nums"
															>
																{quantity(value)}
																{value !== null && ` ${product.unit}`}
															</td>
														))}
													</tr>
												))}
											</tbody>
										</table>
									</div>
									{!products.length && (
										<p className="py-5 text-ink-muted">
											{expiry
												? 'Нет партий с риском по срокам по выбранным условиям.'
												: 'Нет продуктов по выбранным условиям.'}
										</p>
									)}
								</section>
							</>
						)}
					</>
				)
			)}
		</div>
	)
}
