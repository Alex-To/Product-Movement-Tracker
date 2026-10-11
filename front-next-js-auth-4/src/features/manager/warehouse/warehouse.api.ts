import { instance } from '@/api/axios'
export interface WarehouseProduct {
	id: string
	name: string
	unit: string
	availableQuantity: string
	expiredQuantity: string
	batchesCount: number
	nearestExpiry: string | null
	nearestExpired: boolean
	hasExpired: boolean
	expiring: boolean
}
export interface WarehouseBatch {
	id: string
	productId: string
	productName: string
	unit: string
	quantity: string
	receivedQuantity: string | null
	expiresAt: string
	expired: boolean
	remainingSeconds: number
	fefoRank?: number | null
	delivery: {
		id: string
		number: string
		createDate: string
		supplier: { name: string } | null
	}
}
export interface WarehouseSignals {
	expiring: { items: WarehouseBatch[]; total: number }
	expired: { items: WarehouseBatch[]; total: number }
	stopped: {
		items: {
			id: string
			name: string
			autoStop: boolean
			manualStop: boolean
			missing: string[]
		}[]
		total: number
	}
	limit: number
	generatedAt: string
}
export interface WarehouseBatches {
	product: { id: string; name: string; unit: string }
	items: WarehouseBatch[]
	total: number
	goodCount: number
	expiredCount: number
	page: number
	pageSize: number
	generatedAt: string
}
export interface WarehouseProducts {
	items: WarehouseProduct[]
	total: number
	page: number
	pageSize: number
	generatedAt: string
}
export const warehouseKeys = {
	all: ['manager', 'warehouse'] as const,
	products: (userId: string, filters: object) =>
		['manager', 'warehouse', userId, 'products', filters] as const,
	signals: (userId: string) =>
		['manager', 'warehouse', userId, 'signals'] as const,
	batches: (userId: string, id: string, page: number) =>
		['manager', 'warehouse', userId, 'batches', id, page] as const
}
export const warehouseApi = {
	products: async (filters: {
		search: string
		expiringOnly: boolean
		page: number
	}) =>
		(
			await instance.get<WarehouseProducts>('/manager/warehouse/products', {
				params: filters
			})
		).data,
	signals: async () =>
		(await instance.get<WarehouseSignals>('/manager/warehouse/signals')).data,
	batches: async (id: string, page: number) =>
		(
			await instance.get<WarehouseBatches>(
				`/manager/warehouse/products/${id}/batches`,
				{ params: { page } }
			)
		).data
}
export const warehouseDate = (value: string) =>
	new Date(value).toLocaleString('ru-RU', {
		dateStyle: 'short',
		timeStyle: 'short'
	})
export const warehouseQuantity = (value: string) => value.replace('.', ',')
export function remainingTime(batch: WarehouseBatch) {
	if (batch.expired) return 'Просрочено'
	if (batch.remainingSeconds < 60) return 'Меньше минуты'
	if (batch.remainingSeconds < 3600)
		return `${Math.floor(batch.remainingSeconds / 60)} мин`
	if (batch.remainingSeconds < 86400)
		return `${Math.floor(batch.remainingSeconds / 3600)} ч ${Math.floor((batch.remainingSeconds % 3600) / 60)} мин`
	return `${Math.floor(batch.remainingSeconds / 86400)} дн ${Math.floor((batch.remainingSeconds % 86400) / 3600)} ч`
}
