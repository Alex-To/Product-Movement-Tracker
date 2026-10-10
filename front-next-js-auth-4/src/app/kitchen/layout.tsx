import type { PropsWithChildren } from 'react'
import { KitchenNav } from './KitchenNav'

export default function KitchenLayout({ children }: PropsWithChildren) {
	return (
		<div className="w-full max-w-5xl">
			<KitchenNav />
			{children}
		</div>
	)
}
