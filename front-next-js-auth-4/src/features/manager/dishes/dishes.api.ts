import { instance } from '@/api/axios'
export interface DishIngredient {
	productId: string
	name: string
	unit: { id: string; name: string }
	quantity: string
	availableQuantity: string
	missing: boolean
}
export interface ManagerDish {
	id: string
	name: string
	version: number
	deletedAt: string | null
	// Путь от бэкенда: /uploads/dishes/<файл>
	image: string | null
	portions: number
	autoStop: boolean
	manualStop: boolean
	isHot: boolean
	hotSource: 'MANUAL' | 'AUTO' | null
	manualHotUntil: string | null
	manualHotActive: boolean
	ingredients: DishIngredient[]
}
export interface DishInput {
	name: string
	ingredients: { productId: string; unitId: string; quantity: string }[]
}
export const dishKeys = {
	all: ['manager', 'dishes'] as const,
	list: (userId: string, filters: object) =>
		['manager', 'dishes', userId, 'list', filters] as const,
	detail: (userId: string, id: string) =>
		['manager', 'dishes', userId, 'detail', id] as const
}
export const dishesApi = {
	setManualHot: async (id: string, expiresAt?: string | null) =>
		(
			await instance.put<ManagerDish>(`/manager/dishes/${id}/manual-hot`, {
				expiresAt
			})
		).data,
	removeManualHot: async (id: string) =>
		(await instance.delete<ManagerDish>(`/manager/dishes/${id}/manual-hot`))
			.data,
	checkName: async (name: string, excludeId?: string) =>
		(
			await instance.get<{ matches: number }>('/manager/dishes/name-check', {
				params: { name, excludeId }
			})
		).data,
	list: async (filters: { scope: string; search: string; page: number }) =>
		(
			await instance.get<{
				items: ManagerDish[]
				total: number
				pageSize: number
			}>('/manager/dishes', { params: filters })
		).data,
	get: async (id: string) =>
		(await instance.get<ManagerDish>(`/manager/dishes/${id}`)).data,
	save: async (input: DishInput, dish?: ManagerDish) =>
		(dish
			? await instance.patch<{ dish: ManagerDish; warnings: string[] }>(
					`/manager/dishes/${dish.id}`,
					{ ...input, version: dish.version }
				)
			: await instance.post<{ dish: ManagerDish; warnings: string[] }>(
					'/manager/dishes',
					input
				)
		).data,
	uploadImage: async (id: string, image: Blob) => {
		const form = new FormData()
		form.append('image', image, 'dish.jpg')
		// Явный multipart: иначе axios превратит FormData в JSON из-за заголовка по умолчанию
		return (
			await instance.post<ManagerDish>(`/manager/dishes/${id}/image`, form, {
				headers: { 'Content-Type': 'multipart/form-data' }
			})
		).data
	},
	removeImage: async (id: string) =>
		(await instance.delete<ManagerDish>(`/manager/dishes/${id}/image`)).data,
	state: async (dish: ManagerDish, action: 'trash' | 'restore') =>
		(
			await instance.patch<{ dish: ManagerDish; warnings: string[] }>(
				`/manager/dishes/${dish.id}/${action}`,
				{ version: dish.version }
			)
		).data
}
