import { instance } from '@/api/axios'
import axios from 'axios'
import type { ManagerUnit, ProductFilters, ProductInput, ProductsResponse, ProductSaved } from './manager.types'

export const managerApi = {
	units: async () => (await instance.get<ManagerUnit[]>('/manager/units')).data,
	createUnit: async (name: string) => (await instance.post<ManagerUnit>('/manager/units', { name })).data,
	deleteUnit: async (id: string) => { await instance.delete(`/manager/units/${id}`) },
	products: async (filters: ProductFilters) => (await instance.get<ProductsResponse>('/manager/products', {
		params: { ...filters, search: filters.search || undefined, unitId: filters.unitId || undefined }
	})).data,
	checkName: async (name: string, excludeId?: string) => (await instance.get<{ matches: number }>('/manager/products/name-check', { params: { name, excludeId } })).data,
	saveProduct: async (data: ProductInput, id?: string) => (
		id ? await instance.patch<ProductSaved>(`/manager/products/${id}`, data)
			: await instance.post<ProductSaved>('/manager/products', data)
	).data,
	deleteProduct: async (id: string) => { await instance.delete(`/manager/products/${id}`) }
}

export function managerError(error: unknown): string {
	if (axios.isAxiosError(error)) {
		if (error.response?.status === 401) return 'Войдите под учётной записью менеджера.'
		if (error.response?.status === 403) return 'Этот раздел доступен только менеджеру.'
		const message = error.response?.data?.message
		if (Array.isArray(message)) return message.join('. ')
		if (typeof message === 'string') return message
	}
	return 'Не удалось выполнить запрос. Проверьте подключение к серверу и повторите попытку.'
}
