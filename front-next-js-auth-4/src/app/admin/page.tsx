import { Users } from '@/app/admin/Users'

import type { Metadata } from 'next'

export const metadata: Metadata = {
	title: 'Сотрудники'
}

export default function AdminPage() {
	return <Users />
}
