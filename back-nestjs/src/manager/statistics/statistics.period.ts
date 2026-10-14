import { BadRequestException } from '@nestjs/common'
import { StatisticsQueryDto } from './statistics.dto'

export const STATISTICS_TIME_ZONE = 'Europe/Simferopol'
const DAY_MS = 86400000

export function statisticsPeriod(query: StatisticsQueryDto) {
	for (const value of [query.from, query.to]) {
		const date = new Date(`${value}T00:00:00Z`)
		if (
			!Number.isFinite(date.getTime()) ||
			date.toISOString().slice(0, 10) !== value ||
			value < '2000-01-01' ||
			value > '2099-12-31'
		)
			throw new BadRequestException(
				'Укажите существующие даты в пределах 2000–2099 годов'
			)
	}
	const days = (Date.parse(query.to) - Date.parse(query.from)) / DAY_MS + 1
	if (days < 1)
		throw new BadRequestException(
			'Дата окончания не может быть раньше даты начала'
		)
	if (days > 366)
		throw new BadRequestException('Выберите период не длиннее 366 дней')
	const bucket = days === 1 ? ('hour' as const) : ('day' as const)
	const keys =
		bucket === 'hour'
			? Array.from(
					{ length: 24 },
					(_, hour) => `${String(hour).padStart(2, '0')}:00`
				)
			: Array.from({ length: days }, (_, index) =>
					new Date(Date.parse(query.from) + index * DAY_MS)
						.toISOString()
						.slice(0, 10)
				)
	return {
		from: query.from,
		to: query.to,
		timeZone: STATISTICS_TIME_ZONE,
		bucket,
		keys
	}
}
