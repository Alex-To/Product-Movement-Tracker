export type TStopType = 'AUTO' | 'MANUAL'

export interface IMenuDish {
	id: string
	name: string
	// Фото ставит менеджер; путь от бэкенда или null
	image: string | null
	portions: number
	hasRecipe: boolean
	// Количества — строки Decimal: на порцию и годный остаток продукта
	ingredients: {
		productId: string
		name: string
		perPortion: string
		available: string
	}[]
	stops: TStopType[]
	missing: string[]
	// Горячее предложение: официант видит только отметку, без объяснения
	isHot: boolean
	isStopped: boolean
}

export interface IOrderItemData {
	dishId: string
	count: number
	// Продукты, которые гость попросил убрать из блюда
	excludedProductIds?: string[]
}

export interface IOrderData {
	items: IOrderItemData[]
}

export interface IOrderCreated {
	id: string
	// Номер для кухни: сквозной круг 1…99
	number: number
	createDate: string
}

export interface IOrderShortage {
	productName: string
	unit: string
	need: string
	available: string
	dishes: { name: string; count: number }[]
}

export interface IOrderRejection {
	message: string
	stopped: string[]
	shortages: IOrderShortage[]
	available: { dishId: string; name: string; portions: number }[]
}
