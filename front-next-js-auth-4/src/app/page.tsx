import { ADMIN_PAGES } from '@/config/pages/admin.config'
import { DASHBOARD_PAGES } from '@/config/pages/dashboard.config'
import { KITCHEN_PAGES } from '@/config/pages/kitchen.config'
import { PUBLIC_PAGES } from '@/config/pages/public.config'
import { MANAGER_ROUTES } from '@/features/manager/config/manager.routes'
import { WAITER_PAGES } from '@/config/pages/waiter.config'
import Link from 'next/link'

const pages = [
	PUBLIC_PAGES.LOGIN,
	DASHBOARD_PAGES.PROFILE,
	ADMIN_PAGES.HOME,
	KITCHEN_PAGES.HOME,
	WAITER_PAGES.HOME
]

export default function Home() {
	return (
		<div className="p-8">
			<h1 className="mt-4">Home Page</h1>
			<br />
			<p>Для проверки, есть страницы:</p>
			<br />
			<ul className="space-y-2">
				<li><Link className="text-accent underline-offset-2 hover:underline" href={MANAGER_ROUTES.WAREHOUSE}>Менеджер · Склад</Link></li>
				<li><Link className="text-accent underline-offset-2 hover:underline" href={MANAGER_ROUTES.DISHES}>Менеджер · Блюда и рецептуры</Link></li>
				<li><Link className="text-accent underline-offset-2 hover:underline" href={MANAGER_ROUTES.DELIVERIES}>Менеджер · Поставки</Link></li>
				<li><Link className="text-accent underline-offset-2 hover:underline" href={MANAGER_ROUTES.PRODUCTS}>Менеджер · Продукты</Link></li>
				{pages.map(page => (
					<li key={page}>
						<Link
							className="text-accent underline-offset-2 hover:underline"
							href={page}
						>
							{page}
						</Link>
					</li>
				))}
			</ul>
		</div>
	)
}
