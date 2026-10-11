import type { PropsWithChildren } from 'react'
import { KitchenNav } from './KitchenNav'

export default function KitchenLayout({ children }: PropsWithChildren) {
	return (
		<>
			<KitchenNav />
			<div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
				{children}
			</div>
		</>
	)
}
