import { axiosClassic } from '@/api/axios'
import { IFormData } from '@/types/auth.types'
import { IUser } from '@/types/user.types'
import type { AxiosResponse } from 'axios'
import authTokenService from './auth-token.service'

interface IAuthResponse {
	user: IUser
	accessToken: string
}

class AuthService {
	private refreshRequest: Promise<AxiosResponse<IAuthResponse>> | null = null

	async login(data: IFormData) {
		await this.refreshRequest?.catch(() => undefined)
		const response = await axiosClassic.post<IAuthResponse>(
			'/auth/login',
			data
		)

		if (response.data.accessToken) {
			authTokenService.saveAccessToken(response.data.accessToken)
		}

		return response
	}

	getNewTokens() {
		// Several API requests may receive 401 together; renew the session once.
		if (!this.refreshRequest) {
			this.refreshRequest = axiosClassic
				.post<IAuthResponse>('/auth/access-token')
				.then(response => {
					if (response.data.accessToken)
						authTokenService.saveAccessToken(response.data.accessToken)
					return response
				})
				.finally(() => {
					this.refreshRequest = null
				})
		}
		return this.refreshRequest
	}

	async logout() {
		await this.refreshRequest?.catch(() => undefined)
		const response = await axiosClassic.post<boolean>('/auth/logout')

		if (response.data) authTokenService.removeAccessToken()

		return response
	}
}

export default new AuthService()
