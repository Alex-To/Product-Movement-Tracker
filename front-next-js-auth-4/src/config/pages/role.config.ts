import { UserRole } from '@/types/auth.types'
import { ADMIN_PAGES } from './admin.config'
import { DASHBOARD_PAGES } from './dashboard.config'
import { KITCHEN_PAGES } from './kitchen.config'
import { WAITER_PAGES } from './waiter.config'

export const ROLE_LABELS: Record<UserRole, string> = {
	ADMIN: 'Администратор',
	MANAGER: 'Менеджер',
	WAITER: 'Официант',
	KITCHEN: 'Кухня'
}

const ROLE_HOME_PAGES: Record<UserRole, string> = {
	ADMIN: ADMIN_PAGES.HOME,
	MANAGER: ADMIN_PAGES.MANAGER,
	WAITER: WAITER_PAGES.HOME,
	KITCHEN: KITCHEN_PAGES.HOME
}

export const getRoleHomePage = (role?: UserRole | null) =>
	(role && ROLE_HOME_PAGES[role]) || DASHBOARD_PAGES.PROFILE
