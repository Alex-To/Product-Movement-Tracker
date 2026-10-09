import { ManagerContent } from '@/app/manager/ManagerContent'
import type { Metadata } from 'next'

export const metadata: Metadata = {
	title: 'Manager content'
}

export default function ManagerPage() {
	return <ManagerContent />
}
