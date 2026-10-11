import { MANAGER_ROUTES } from '@/features/manager/config/manager.routes'
import { UserRole } from '@/types/auth.types'
import { ADMIN_PAGES } from './admin.config'
import { KITCHEN_PAGES } from './kitchen.config'
import { PUBLIC_PAGES } from './public.config'
import { WAITER_PAGES } from './waiter.config'

export const ROLE_LABELS: Record<UserRole, string> = {
	ADMIN: 'Администратор',
	MANAGER: 'Менеджер',
	WAITER: 'Официант',
	KITCHEN: 'Кухня'
}

const ROLE_HOME_PAGES: Record<UserRole, string> = {
	ADMIN: ADMIN_PAGES.HOME,
	MANAGER: MANAGER_ROUTES.WAREHOUSE,
	WAITER: WAITER_PAGES.HOME,
	KITCHEN: KITCHEN_PAGES.HOME
}

export const getRoleHomePage = (role?: UserRole | null) =>
	(role && ROLE_HOME_PAGES[role]) || PUBLIC_PAGES.LOGIN
