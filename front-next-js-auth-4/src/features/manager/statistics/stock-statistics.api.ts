import { instance } from '@/api/axios'
import type { HotPreview } from '../settings/settings.api'
import type { Period } from './statistics.api'

export type ForecastProduct = {
	id: string
	name: string
	unitId: string
	unit: string
	usable: string
	expired: string
	unusable: string
	atRisk: string
	dailyDemand: string | null
	demand: string | null
	expectedUse: string | null
	expectedLoss: string | null
	toOrder: string | null
	batches: {
		id: string
		quantity: string
		expiresAt: string
		usableUntil: string
		status: 'fresh' | 'urgent' | 'unusable' | 'expired'
		expectedUse: string | null
		expectedLoss: string | null
	}[]
}
export type Forecast = {
	generatedAt: string
	until: string
	days: number
	demandDays: number
	historyFrom: string
	historyUntil: string
	observationHours: number | null
	includeRejections: boolean
	cookReserveMinutes: number
	products: ForecastProduct[]
}
type WriteOffTotals = {
	auto: string
	manualExpired: string
	otherManual: string
}
export type ExpiryHistory = {
	period: Period & { bucket: 'hour' | 'day' }
	generatedAt: string
	movements: number
	batches: number
	units: {
		id: string
		name: string
		products: (WriteOffTotals & { id: string; name: string; batches: number })[]
		series: (WriteOffTotals & { key: string })[]
	}[]
}
export const stockStatisticsApi = {
	forecast: async (
		days: number,
		includeRejections: boolean,
		signal?: AbortSignal
	) =>
		(
			await instance.get<Forecast>('/manager/statistics/forecast', {
				params: { days, includeRejections: String(includeRejections) },
				signal
			})
		).data,
	expiry: async (period: Period, signal?: AbortSignal) =>
		(
			await instance.get<ExpiryHistory>('/manager/statistics/expiry', {
				params: period,
				signal
			})
		).data,
	hot: async (signal?: AbortSignal) =>
		(await instance.get<HotPreview>('/manager/hot-preview', { signal })).data
}
export const statisticsCard =
	'rounded-lg border border-border bg-surface-raised p-5 sm:p-6'
export const quantity = (value: string | number | null) =>
	value === null
		? 'Недостаточно данных'
		: Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 3 })
export const statisticsDate = (value: string) =>
	new Date(value).toLocaleString('ru-RU', {
		timeZone: 'Europe/Simferopol',
		dateStyle: 'short',
		timeStyle: 'short'
	})
