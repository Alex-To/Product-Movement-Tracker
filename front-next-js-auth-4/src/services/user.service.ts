import { instance } from '@/api/axios'
import { IUser } from '@/types/user.types'

class UserService {
	private _BASE_URL = '/users'

	async fetchProfile() {
		return instance.get<IUser>(`${this._BASE_URL}/profile`)
	}

	async fetchList() {
		return instance.get<IUser[]>(`${this._BASE_URL}/list`)
	}
}

export default new UserService()
