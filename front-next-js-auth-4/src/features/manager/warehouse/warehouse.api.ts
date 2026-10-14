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
// Решает сервер: просрочена / нельзя готовить (меньше запаса на готовку) / срочная / свежая
export type BatchStatus = 'expired' | 'unusable' | 'urgent' | 'fresh'
export interface WarehouseBatch {
	id: string
	productId: string
	productName: string
	unit: string
	quantity: string
	receivedQuantity: string | null
	expiresAt: string
	status: BatchStatus
	expired: boolean
	fefoRank?: number | null
	delivery: {
		id: string
		number: string
		createDate: string
		supplier: { name: string } | null
	}
}
export interface AutoWriteOff {
	messageId: string
	writtenOffAt: string
	quantity: string
	batch: WarehouseBatch
}
export interface WarehouseSignals {
	expiring: { items: WarehouseBatch[]; total: number }
	expired: { items: WarehouseBatch[]; total: number }
	// Партии, которые система списала сама в момент истечения срока
	autoWrittenOff: { items: AutoWriteOff[]; total: number }
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
	unusableCount: number
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
		).data,
	writeOffBatch: async (id: string) =>
		(
			await instance.post<{ writtenOff: string }>(
				`/manager/warehouse/batches/${id}/write-off`
			)
		).data,
	readMessages: async (ids: string[]) =>
		(await instance.post<{ read: number }>('/manager/warehouse/messages/read', { ids })).data
}
export const warehouseDate = (value: string) =>
	new Date(value).toLocaleString('ru-RU', {
		dateStyle: 'short',
		timeStyle: 'short'
	})
export const warehouseQuantity = (value: string | number) => String(value).replace('.', ',')
// «Просрочено» решает сервер; остаток времени — от серверного «сейчас».
// Срок наступил, а сервер ещё не обновил статус — до ответа показываем «меньше минуты»
export function remainingTime(batch: WarehouseBatch, now: number) {
	if (batch.expired) return 'Просрочено'
	const seconds = Math.floor((new Date(batch.expiresAt).getTime() - now) / 1000)
	if (seconds < 60) return 'Меньше минуты'
	if (seconds < 3600) return `${Math.floor(seconds / 60)} мин`
	if (seconds < 86400)
		return `${Math.floor(seconds / 3600)} ч ${Math.floor((seconds % 3600) / 60)} мин`
	return `${Math.floor(seconds / 86400)} дн ${Math.floor((seconds % 86400) / 3600)} ч`
}
