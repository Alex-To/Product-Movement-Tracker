import { UserRole } from './auth.types'

export interface IUser {
	id: string
	login: string
	name: string
	role: UserRole
}
