import { instance } from '@/api/axios'
import { IUser } from '@/types/user.types'

class UserService {
	private _BASE_URL = '/users'

	async fetchProfile(signal?: AbortSignal) {
		return instance.get<IUser>(`${this._BASE_URL}/profile`, { signal })
	}
}

export default new UserService()
