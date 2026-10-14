import { instance } from '@/api/axios'

// Почему заказ не принят — вычисляет сервер
export type RejectionReason = 'STOP_LIST' | 'SHORTAGE' | 'BUSY'

export const REJECTION_REASONS: Record<RejectionReason, string> = {
	SHORTAGE: 'Не хватило продуктов',
	STOP_LIST: 'Блюдо в стоп-листе',
	BUSY: 'Склад был занят'
}

export interface OrderRejection {
	id: string
	createDate: string
	reason: RejectionReason
	waiterName: string
	lines: { dishName: string; count: number; excluded: string[] }[]
	details: {
		stopped?: string[]
		shortages?: { productName: string; unit: string; need: string | number; available: string | number }[]
	}
}

export interface OrderRejections {
	items: OrderRejection[]
	total: number
	page: number
	pageSize: number
	last24h: {
		total: number
		byReason: Record<RejectionReason, number>
		topMissing: { productName: string; unit: string; times: number }[]
	}
	generatedAt: string
}

export const rejectionsKeys = {
	list: (userId: string, page: number) =>
		['manager', 'rejections', userId, page] as const
}

export const rejectionsApi = {
	list: async (page: number) =>
		(await instance.get<OrderRejections>('/manager/rejections', { params: { page } }))
			.data
}
