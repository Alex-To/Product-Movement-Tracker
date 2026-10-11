import { UserRole } from '@/types/auth.types'
import { ADMIN_PAGES } from './admin.config'
import { DASHBOARD_PAGES } from './dashboard.config'
import { KITCHEN_PAGES } from './kitchen.config'

export const ROLE_LABELS: Record<UserRole, string> = {
	ADMIN: 'Администратор',
	MANAGER: 'Менеджер',
	WAITER: 'Официант',
	KITCHEN: 'Кухня'
}

// Стартовый экран роли после входа (карта маршрутов, S1).
// Экран официанта ещё не готов — пока ведём в профиль.
const ROLE_HOME_PAGES: Record<UserRole, string> = {
	ADMIN: ADMIN_PAGES.HOME,
	MANAGER: ADMIN_PAGES.MANAGER,
	WAITER: DASHBOARD_PAGES.PROFILE,
	KITCHEN: KITCHEN_PAGES.HOME
}

export const getRoleHomePage = (role?: UserRole | null) =>
	(role && ROLE_HOME_PAGES[role]) || DASHBOARD_PAGES.PROFILE
