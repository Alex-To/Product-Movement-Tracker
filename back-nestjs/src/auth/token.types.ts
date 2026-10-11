import type { Role } from '@prisma/client'

// Тип токена в payload: access нельзя подсунуть вместо refresh и наоборот
export const TokenType = {
	ACCESS: 'access',
	REFRESH: 'refresh'
} as const

export type TokenType = (typeof TokenType)[keyof typeof TokenType]

export interface ITokenPayload {
	id: string
	role: Role
	type: TokenType
}
