import type { Metadata } from 'next'
import { KitchenOrders } from './KitchenOrders'

export const metadata: Metadata = {
	title: 'Кухня — заказы'
}

export default function KitchenOrdersPage() {
	return <KitchenOrders />
}
