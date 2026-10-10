import type { Metadata } from 'next'
import { StopList } from './StopList'

export const metadata: Metadata = {
	title: 'Кухня — стоп-лист'
}

export default function KitchenStopListPage() {
	return <StopList />
}
