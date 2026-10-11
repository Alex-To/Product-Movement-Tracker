import { UserRole } from './auth.types'
import { IUser } from './user.types'

export type TAssignableRole = Exclude<UserRole, 'ADMIN'>

export interface IAdminUserCreateData extends Pick<IUser, 'login' | 'name'> {
	password: string
	role: TAssignableRole
}

export type IAdminUserUpdateData = Partial<IAdminUserCreateData>
