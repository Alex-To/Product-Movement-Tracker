import { AuthToken } from '@/types/auth.types'
import { NextRequest } from 'next/server'
import { getNewTokensByRefresh } from './get-new-tokens-by-refresh'
import { jwtVerifyServer } from './jwt-verify'

// Access-токен живёт час. Если он истёк или пропал, а refresh жив —
// выпускаем новый, а не выкидываем сотрудника на страницу входа
export async function refreshAccessTokenIfNeeded(request: NextRequest) {
	const refreshToken = request.cookies.get(AuthToken.REFRESH_TOKEN)?.value
	if (!refreshToken) return null

	const accessToken = request.cookies.get(AuthToken.ACCESS_TOKEN)?.value
	if (accessToken && (await jwtVerifyServer(accessToken))) return null

	try {
		const data = await getNewTokensByRefresh(refreshToken)
		// Дальше по цепочке защита страниц увидит уже свежий токен
		request.cookies.set(AuthToken.ACCESS_TOKEN, data.accessToken)
		return data.accessToken
	} catch {
		return null
	}
}
