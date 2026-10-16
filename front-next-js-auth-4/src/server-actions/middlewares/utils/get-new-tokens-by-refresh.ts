'use server'

import { IUser } from '@/types/user.types'

interface IAuthResponse {
	user: IUser
	accessToken: string
}

export async function getNewTokensByRefresh(refreshToken: string) {
	const internalApi =
		process.env.API_INTERNAL_URL || 'http://127.0.0.1:4200/api'
	const response = await fetch(`${internalApi}/auth/access-token`, {
		method: 'POST',
		cache: 'no-store',
		headers: {
			'Content-Type': 'application/json',
			Cookie: `refreshToken=${refreshToken}`
		},
		credentials: 'include'
	})

	if (!response.ok) {
		throw new Error('Failed to fetch new tokens')
	}

	const data: IAuthResponse = await response.json()
	return data
}
