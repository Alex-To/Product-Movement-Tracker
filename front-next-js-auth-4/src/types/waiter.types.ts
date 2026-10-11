export type TStopType = 'AUTO' | 'MANUAL'

export interface IMenuDish {
	id: string
	name: string
	portions: number
	hasRecipe: boolean
	stops: TStopType[]
	missing: string[]
	expiring: { productName: string; expiresAt: string } | null
	isHot: boolean
	isStopped: boolean
}

export interface IOrderItemData {
	dishId: string
	count: number
}

export interface IOrderData {
	items: IOrderItemData[]
}

export interface IOrderCreated {
	id: string
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
