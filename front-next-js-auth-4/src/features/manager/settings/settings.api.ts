import { instance } from '@/api/axios'

export interface RestaurantSettings {
	cookReserveMinutes: number
	urgentPercent: number
	urgentMinHours: number
	urgentMaxHours: number
	hotLimit: number
	// За сколько дней считать спрос на блюдо для горячих
	demandDays: number
}

export interface SavedSettings extends RestaurantSettings {
	updatedAt: string | null
}

// Утверждённые значения по умолчанию — те же, что в миграции бэкенда
export const DEFAULT_SETTINGS: RestaurantSettings = {
	cookReserveMinutes: 30,
	urgentPercent: 25,
	urgentMinHours: 24,
	urgentMaxHours: 168,
	hotLimit: 3,
	demandDays: 7
}

export const settingsKeys = {
	get: (userId: string) => ['manager', 'settings', userId] as const,
	hotPreview: (userId: string, settings: RestaurantSettings) =>
		['manager', 'hot-preview', userId, settings] as const
}

// Почему блюдо горячее: вклад продукта, который скоро истечёт
export interface HotReason {
	productName: string
	unit: string
	atRisk: string
	// Сколько из этого успеют израсходовать на блюдо до конца сроков
	saves: string
	urgency: number
	nearestExpiry: string
	contribution: number
}

export interface HotPreview {
	generatedAt: string
	hotLimit: number
	demandDays: number
	// Есть ли заказы или отказы за период; без них считаем «продадут все N»
	hasDemand: boolean
	candidates: number
	manualCount: number
	items: {
		id: string
		name: string
		portions: number
		isHot: boolean
		hotSource: 'MANUAL' | 'AUTO' | null
		manualHotUntil: string | null
		manualHotActive: boolean
		score: number
		// Порций в день по спросу за период; null — истории нет
		salesPerDay: number | null
		reasons: HotReason[]
	}[]
}

export const settingsApi = {
	get: async () =>
		(await instance.get<SavedSettings>('/manager/settings')).data,
	save: async (data: RestaurantSettings) =>
		(await instance.put<SavedSettings>('/manager/settings', data)).data,
	// Предпросмотр по настройкам из формы, даже не сохранённым
	hotPreview: async (settings: RestaurantSettings) =>
		(
			await instance.get<HotPreview>('/manager/hot-preview', {
				params: settings
			})
		).data
}

// Окно срочности для продукта с заданным сроком хранения — как на бэкенде
export function urgentWindowHours(
	shelfLifeHours: number,
	settings: Pick<
		RestaurantSettings,
		'urgentPercent' | 'urgentMinHours' | 'urgentMaxHours'
	>
) {
	return Math.min(
		Math.max(
			(shelfLifeHours * settings.urgentPercent) / 100,
			settings.urgentMinHours
		),
		settings.urgentMaxHours
	)
}
