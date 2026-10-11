import type { PropsWithChildren } from 'react'
import { WaiterNav } from './WaiterNav'

export default function WaiterLayout({ children }: PropsWithChildren) {
	return (
		<>
			<WaiterNav />
			<div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
				{children}
			</div>
		</>
	)
}
