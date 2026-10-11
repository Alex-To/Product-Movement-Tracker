import type { Metadata } from 'next'
import { ProfileInfo } from './ProfileInfo'

export const metadata: Metadata = {
	title: 'Profile'
}

export default function Page() {
	return (
		<div className="p-8">
			<ProfileInfo />
		</div>
	)
}
