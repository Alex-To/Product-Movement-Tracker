import { useId } from 'react'

export type ChartRow = { label: string; values: number[] }
export type ChartLegend = { name: string; color: string }
const number = (value: number) =>
	value.toLocaleString('ru-RU', { maximumFractionDigits: 6 })

export function StatisticsChart({
	rows,
	legend,
	timeline,
	title
}: {
	rows: ChartRow[]
	legend: ChartLegend[]
	timeline: boolean
	title: string
}) {
	const id = useId()
	const max =
		Math.max(
			0,
			...rows.map((row) => row.values.reduce((sum, value) => sum + value, 0))
		) || 1
	const magnitude = 10 ** Math.floor(Math.log10(max / 4))
	const tickStep = Math.ceil(max / 4 / magnitude) * magnitude
	const scaleMax = tickStep * 4
	const width = 900,
		left = timeline ? 60 : 240,
		right = 65
	const height = timeline ? 310 : Math.max(140, rows.length * 42 + 45)
	const bottom = height - 35,
		plot = width - left - right
	return (
		<>
			<div className="mb-4 flex flex-wrap gap-x-6 gap-y-2 text-caption text-ink-muted">
				{legend.map((item) => (
					<span key={item.name} className="flex items-center gap-2">
						<span
							className="size-3 rounded-full"
							style={{ background: item.color }}
						/>
						{item.name}
					</span>
				))}
			</div>
			{!rows.length ? (
				<p className="rounded-md bg-tint p-8 text-center text-ink-muted">
					За выбранный период данных нет.
				</p>
			) : (
				<div className="max-h-[520px] overflow-auto">
					<svg
						role="img"
						aria-labelledby={id}
						viewBox={`0 0 ${width} ${height}`}
						className="w-full min-w-[620px] text-ink-muted"
					>
						<title id={id}>
							{title}. Точные значения доступны в таблице ниже.
						</title>
						{[0, 1, 2, 3, 4].map((tick) => {
							const value = tickStep * tick
							const position = timeline
								? bottom - (value / scaleMax) * (bottom - 20)
								: left + (value / scaleMax) * plot
							return (
								<g key={tick} fill="currentColor" fontSize="12">
									<line
										x1={timeline ? left : position}
										x2={timeline ? width - right : position}
										y1={timeline ? position : 10}
										y2={timeline ? position : bottom}
										stroke="var(--border)"
									/>
									<text
										x={timeline ? left - 12 : position}
										y={timeline ? position + 4 : height - 10}
										textAnchor={timeline ? 'end' : 'middle'}
									>
										{number(value)}
									</text>
								</g>
							)
						})}
						{rows.map((row, index) => {
							let offset = 0
							const step = plot / Math.max(1, rows.length)
							return (
								<g key={index}>
									{row.values.map((value, series) => {
										const size =
											(value / scaleMax) * (timeline ? bottom - 20 : plot)
										const x = timeline
											? left + index * step + step * 0.15
											: left + offset
										const y = timeline
											? bottom - offset - size
											: 15 + index * 42
										offset += size
										return (
											<rect
												key={series}
												x={x}
												y={y}
												width={timeline ? Math.max(0.5, step * 0.7) : size}
												height={timeline ? size : 24}
												rx="2"
												fill={legend[series].color}
											>
												<title>
													{row.label}: {legend[series].name} — {number(value)}
												</title>
											</rect>
										)
									})}
									{(!timeline ||
										index % Math.ceil(rows.length / 8) === 0 ||
										index === rows.length - 1) && (
										<text
											x={timeline ? left + index * step + step / 2 : left - 12}
											y={timeline ? height - 12 : 32 + index * 42}
											textAnchor={timeline ? 'middle' : 'end'}
											fontSize="13"
											fill="var(--ink)"
										>
											<title>{row.label}</title>
											{row.label.length > 27
												? `${row.label.slice(0, 26)}…`
												: row.label}
										</text>
									)}
								</g>
							)
						})}
					</svg>
				</div>
			)}
		</>
	)
}
