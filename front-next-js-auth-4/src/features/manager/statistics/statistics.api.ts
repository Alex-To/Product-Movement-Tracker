import { instance } from '@/api/axios'

export type Period = { from: string; to: string }
export type Statistics = {
	period: Period & { bucket: 'hour' | 'day'; timeZone: string }
	summary: {
		portions: number
		orders?: number
		dishes?: number
		attempts?: number
		incompleteAttempts?: number
		byReason?: { STOP_LIST: number; SHORTAGE: number; BUSY: number }
	}
	dishes: {
		dishId: string
		name: string
		portions: number
		orders?: number
		archived?: boolean
		attempts?: number
		stopList?: number
		shortage?: number
	}[]
	series: {
		key: string
		portions: number
		orders?: number
		attempts?: number
		stopList?: number
		shortage?: number
		busy?: number
	}[]
	generatedAt: string
}
export type Section = 'sales' | 'rejections'
export const statisticsApi = {
	get: async (section: Section, period: Period, signal?: AbortSignal) =>
		(
			await instance.get<Statistics>(`/manager/statistics/${section}`, {
				params: period,
				signal
			})
		).data
}

export function restaurantToday() {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat('en-CA', {
			timeZone: 'Europe/Simferopol',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		})
			.formatToParts()
			.map((part) => [part.type, part.value])
	)
	return `${parts.year}-${parts.month}-${parts.day}`
}
export function shiftDate(date: string, days: number) {
	const value = new Date(`${date}T00:00:00Z`)
	value.setUTCDate(value.getUTCDate() + days)
	return value.toISOString().slice(0, 10)
}
