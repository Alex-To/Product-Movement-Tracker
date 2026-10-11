export interface IKitchenOrder {
	id: string
	createDate: string
	creater: { name: string }
	items: {
		id: string
		count: number
		dish: { id: string; name: string }
	}[]
}

export interface IKitchenBatch {
	id: string
	count: string
	EXP: string
	delivery: { number: string }
}

export interface IKitchenProduct {
	id: string
	nameProduct: string
	unit: { name: string }
	batches: IKitchenBatch[]
}

export interface IWriteOff {
	id: string
	count: string
	createDate: string
	batch: {
		delivery: { number: string }
		product: { nameProduct: string; unit: { name: string } }
	}
}

export interface IWriteOffData {
	batchId: string
	count: string
}

export type TStopType = 'AUTO' | 'MANUAL'

export interface IStopListDish {
	id: string
	name: string
	portions: number | null
	missing: string[]
	stops: { type: TStopType; createrName: string | null }[]
}
