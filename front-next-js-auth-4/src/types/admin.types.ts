import { UserRole } from './auth.types'
import { IUser } from './user.types'

// Роль ADMIN через интерфейс назначить нельзя: администратор один, заводится сидом
export type TAssignableRole = Exclude<UserRole, 'ADMIN'>

export interface IAdminUserCreateData extends Pick<IUser, 'login' | 'name'> {
	password: string
	role: TAssignableRole
}

// Пустой пароль не отправляется = не менять
export type IAdminUserUpdateData = Partial<IAdminUserCreateData>
