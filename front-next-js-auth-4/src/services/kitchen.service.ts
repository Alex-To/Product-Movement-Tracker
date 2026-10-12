import { instance } from '@/api/axios'
import {
	IKitchenOrder,
	IKitchenProduct,
	IStopListDish,
	IWriteOff,
	IWriteOffData
} from '@/types/kitchen.types'

class KitchenService {
	private _BASE_URL = '/kitchen'

	async fetchOrders() {
		return instance.get<IKitchenOrder[]>(`${this._BASE_URL}/orders`)
	}

	async markOrderReady(orderId: string) {
		return instance.post(`${this._BASE_URL}/orders/${orderId}/ready`)
	}

	async fetchProducts() {
		return instance.get<IKitchenProduct[]>(`${this._BASE_URL}/products`)
	}

	async fetchWriteOffs() {
		return instance.get<IWriteOff[]>(`${this._BASE_URL}/write-offs`)
	}

	async writeOff(data: IWriteOffData) {
		return instance.post(`${this._BASE_URL}/write-offs`, data)
	}

	async fetchStopList() {
		return instance.get<IStopListDish[]>(`${this._BASE_URL}/stop-list`)
	}

	async setManualStop(dishId: string) {
		return instance.post(`${this._BASE_URL}/stop-list/${dishId}`)
	}

	async removeManualStop(dishId: string) {
		return instance.delete(`${this._BASE_URL}/stop-list/${dishId}`)
	}
}

export default new KitchenService()
