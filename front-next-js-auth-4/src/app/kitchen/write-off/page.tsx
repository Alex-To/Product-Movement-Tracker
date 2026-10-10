import type { Metadata } from 'next'
import { WriteOffForm } from './WriteOffForm'
import { WriteOffHistory } from './WriteOffHistory'

export const metadata: Metadata = {
	title: 'Кухня — списание'
}

export default function KitchenWriteOffPage() {
	return (
		<div className="flex flex-col gap-8">
			<WriteOffForm />
			<WriteOffHistory />
		</div>
	)
}
