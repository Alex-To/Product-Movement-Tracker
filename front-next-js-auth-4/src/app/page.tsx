import { ADMIN_PAGES } from '@/config/pages/admin.config'
import { DASHBOARD_PAGES } from '@/config/pages/dashboard.config'
import { KITCHEN_PAGES } from '@/config/pages/kitchen.config'
import { PUBLIC_PAGES } from '@/config/pages/public.config'
import Link from 'next/link'

const pages = [
	PUBLIC_PAGES.LOGIN,
	DASHBOARD_PAGES.PROFILE,
	ADMIN_PAGES.HOME,
	KITCHEN_PAGES.HOME
]

export default function Home() {
	return (
		<div className="p-8">
			<h1 className="mt-4">Home Page</h1>
			<br />
			<p>Для проверки, есть страницы:</p>
			<br />
			<ul className="space-y-2">
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
