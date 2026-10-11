'use client'

import { AppHeader } from '@/components/ui/AppHeader'
import { KITCHEN_PAGES } from '@/config/pages/kitchen.config'
import { usePathname } from 'next/navigation'

const links = [
	{ href: KITCHEN_PAGES.ORDERS, label: 'Заказы' },
	{ href: KITCHEN_PAGES.WRITE_OFF, label: 'Списание' },
	{ href: KITCHEN_PAGES.STOP_LIST, label: 'Стоп-лист' }
]

export function KitchenNav() {
	const pathname = usePathname()

	return (
		<AppHeader
			homeHref={KITCHEN_PAGES.HOME}
			tabsLabel="Разделы кухни"
			tabsPlacement="inline"
			tabs={links.map(link => ({ ...link, isActive: pathname === link.href }))}
		/>
	)
}
