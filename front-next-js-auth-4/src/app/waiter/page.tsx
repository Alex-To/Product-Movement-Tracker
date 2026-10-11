import type { Metadata } from 'next'
import { WaiterMenu } from './WaiterMenu'

export const metadata: Metadata = {
	title: 'Официант — меню'
}

export default function WaiterMenuPage() {
	return <WaiterMenu />
}
