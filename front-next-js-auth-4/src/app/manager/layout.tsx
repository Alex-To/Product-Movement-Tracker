import { ManagerNav } from '@/features/manager/components/ManagerNav'
import type { ReactNode } from 'react'

export default function ManagerLayout({ children }: { children: ReactNode }) {
	return <><ManagerNav /><div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</div></>
}
