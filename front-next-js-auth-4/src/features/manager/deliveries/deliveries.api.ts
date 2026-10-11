import { instance } from '@/api/axios'

export interface Supplier {
	id: string
	name: string
}
export interface DeliveryInput {
	receivedAt?: string
	requestId: string
	supplierId: string
	number: string
	lines: {
		productId: string
		unitId: string
		quantity: string
		expiresAt: string
	}[]
}
export interface DeliverySummary {
	id: string
	number: string
	createDate: string
	supplier: Supplier | null
	creater: { id: string; name: string }
	_count: { batches: number }
}
export interface DeliveryDetail extends DeliverySummary {
	batches: {
		id: string
		idProduct: string
		count: string
		receivedCount: string | null
		EXP: string
		productNameAtReceipt: string | null
		unitNameAtReceipt: string | null
		product: { nameProduct: string; unit: { name: string } }
	}[]
}
export const deliveryKeys = {
	all: ['manager', 'deliveries'] as const,
	suppliers: (userId: string) =>
		['manager', 'deliveries', userId, 'suppliers'] as const,
	list: (userId: string, search: string, page: number) =>
		['manager', 'deliveries', userId, 'list', search, page] as const,
	detail: (userId: string, id: string) =>
		['manager', 'deliveries', userId, 'detail', id] as const
}
export const deliveriesApi = {
	suppliers: async () =>
		(await instance.get<Supplier[]>('/manager/suppliers')).data,
	createSupplier: async (name: string) =>
		(await instance.post<Supplier>('/manager/suppliers', { name })).data,
	list: async (search: string, page: number) =>
		(
			await instance.get<{
				items: DeliverySummary[]
				total: number
				page: number
				pageSize: number
			}>('/manager/deliveries', { params: { search, page } })
		).data,
	get: async (id: string) =>
		(await instance.get<DeliveryDetail>(`/manager/deliveries/${id}`)).data,
	receive: async (input: DeliveryInput) =>
		(await instance.post<DeliveryDetail>('/manager/deliveries', input)).data
}
export const receiptDate = (value: string) =>
	new Date(value).toLocaleString('ru-RU', {
		dateStyle: 'short',
		timeStyle: 'short'
	})
