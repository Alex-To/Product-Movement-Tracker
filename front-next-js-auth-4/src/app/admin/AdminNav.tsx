'use client'

import { AppHeader } from '@/components/ui/AppHeader'
import { ADMIN_PAGES } from '@/config/pages/admin.config'

// У администратора один раздел — вкладки не нужны
export function AdminNav() {
	return <AppHeader homeHref={ADMIN_PAGES.HOME} />
}
