'use client'

import { AppHeader } from '@/components/ui/AppHeader'
import { WAITER_PAGES } from '@/config/pages/waiter.config'

// У официанта одна страница — вкладки не нужны
export function WaiterNav() {
	return <AppHeader homeHref={WAITER_PAGES.HOME} />
}
