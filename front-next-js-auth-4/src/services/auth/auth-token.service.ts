import { AuthToken } from '@/types/auth.types'
import Cookies from 'js-cookie'

class AuthTokenService {
	getAccessToken() {
		const accessToken = Cookies.get(AuthToken.ACCESS_TOKEN)
		return accessToken || null
	}

	saveAccessToken(accessToken: string) {
		Cookies.set(AuthToken.ACCESS_TOKEN, accessToken, {
			path: '/',
			secure: window.location.protocol === 'https:',
			sameSite: 'strict',
			expires: 1
		})
	}

	removeAccessToken() {
		Cookies.remove(AuthToken.ACCESS_TOKEN, { path: '/' })
	}
}

export default new AuthTokenService()
