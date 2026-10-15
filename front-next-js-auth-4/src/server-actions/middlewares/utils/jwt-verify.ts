'use server'

import { ITokenInside } from '@/types/auth.types'
import { transformUserToState } from '@/utils/transform-user-to-state'
import { jwtVerify } from 'jose/jwt/verify'

export async function jwtVerifyServer(accessToken: string) {
	try {
		const { payload }: { payload: ITokenInside } = await jwtVerify(
			accessToken,
			new TextEncoder().encode(`${process.env.JWT_SECRET}`)
		)

		// Refresh-токен в cookie accessToken не считается входом
		if (!payload || payload.type !== 'access') return null

		return transformUserToState({ id: payload.id, role: payload.role })
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.includes('exp claim timestamp check failed')
		) {
			console.log('Токен истек')
			return null
		}

		console.log('Ошибка при верификации токена: ', error)
		return null
	}
}
