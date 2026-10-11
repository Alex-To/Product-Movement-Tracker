import type { PropsWithChildren } from 'react'
import { KitchenNav } from './KitchenNav'

export default function KitchenLayout({ children }: PropsWithChildren) {
	return (
		<div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8">
			<KitchenNav />
			{children}
		</div>
	)
}
