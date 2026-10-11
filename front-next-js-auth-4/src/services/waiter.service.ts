import { instance } from '@/api/axios'
import { IMenuDish, IOrderCreated, IOrderData } from '@/types/waiter.types'

class WaiterService {
	private _BASE_URL = '/waiter'

	async fetchMenu() {
		return instance.get<IMenuDish[]>(`${this._BASE_URL}/menu`)
	}

	async createOrder(data: IOrderData) {
		return instance.post<IOrderCreated>(`${this._BASE_URL}/orders`, data)
	}
}

export default new WaiterService()
