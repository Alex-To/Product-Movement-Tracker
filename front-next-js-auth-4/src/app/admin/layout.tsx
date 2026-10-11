import type { PropsWithChildren } from 'react'
import { AdminNav } from './AdminNav'

export default function AdminLayout({ children }: PropsWithChildren) {
	return (
		<>
			<AdminNav />
			<div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
				{children}
			</div>
		</>
	)
}
