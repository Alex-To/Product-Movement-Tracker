import { UserRole, type TProtectUserData } from '@/types/auth.types'

export type TUserDataState = {
	id: string
	role: UserRole
	isLoggedIn: boolean
	isAdmin: boolean
	isManager: boolean
	isWaiter: boolean
	isKitchen: boolean
}

export const transformUserToState = (
	user: TProtectUserData
): TUserDataState | null => {
	return {
		...user,
		isLoggedIn: true,
		isAdmin: user.role === UserRole.ADMIN,
		isManager: user.role === UserRole.MANAGER,
		isWaiter: user.role === UserRole.WAITER,
		isKitchen: user.role === UserRole.KITCHEN
	}
}
