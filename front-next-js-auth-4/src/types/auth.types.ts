import { IUser } from './user.types'

export const AuthToken = {
	ACCESS_TOKEN: 'accessToken',
	REFRESH_TOKEN: 'refreshToken'
} as const

export type AuthToken = (typeof AuthToken)[keyof typeof AuthToken]

export const UserRole = {
	ADMIN: 'ADMIN',
	MANAGER: 'MANAGER',
	WAITER: 'WAITER',
	KITCHEN: 'KITCHEN'
} as const

export type UserRole = (typeof UserRole)[keyof typeof UserRole]

export interface ITokenInside {
	id: string
	role: UserRole
	iat: number
	exp: number
}

export type TProtectUserData = Omit<ITokenInside, 'iat' | 'exp'>

export interface IFormData extends Pick<IUser, 'login'> {
	password: string
}
