import { instance } from '@/api/axios'
import {
	IAdminUserCreateData,
	IAdminUserUpdateData
} from '@/types/admin.types'
import { IUser } from '@/types/user.types'

class AdminService {
	private _BASE_URL = '/admin'

	async fetchUsers() {
		return instance.get<IUser[]>(`${this._BASE_URL}/users`)
	}

	async createUser(data: IAdminUserCreateData) {
		return instance.post<IUser>(`${this._BASE_URL}/users`, data)
	}

	async updateUser(id: string, data: IAdminUserUpdateData) {
		return instance.patch<IUser>(`${this._BASE_URL}/users/${id}`, data)
	}

	async deleteUser(id: string) {
		return instance.delete<boolean>(`${this._BASE_URL}/users/${id}`)
	}
}

export default new AdminService()
