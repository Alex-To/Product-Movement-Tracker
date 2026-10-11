import { MANAGER_ROUTES } from '@/features/manager/config/manager.routes'
import { redirect } from 'next/navigation'

export default function ManagerPage() {
	redirect(MANAGER_ROUTES.WAREHOUSE)
}
