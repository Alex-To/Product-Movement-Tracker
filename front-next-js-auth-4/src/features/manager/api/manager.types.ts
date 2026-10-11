export interface ManagerUnit {
	id: string
	name: string
	productsCount: number
	canDelete: boolean
}

export interface ManagerProduct {
	id: string
	name: string
	unit: { id: string; name: string }
	batchesCount: number
	dishesCount: number
	canDelete: boolean
	canChangeUnit: boolean
	availableQuantity: string
}

export interface ProductInput { name: string; unitId: string }
export interface ProductFilters { search: string; unitId: string; page: number }
export interface ProductsResponse {
	items: ManagerProduct[]
	total: number
	page: number
	pageSize: number
	generatedAt: string
}
export interface ProductSaved {
	product: Omit<ManagerProduct, 'availableQuantity'>
	warnings: string[]
}
