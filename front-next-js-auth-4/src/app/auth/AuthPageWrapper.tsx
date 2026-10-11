import { Logo } from '@/components/ui/Logo'
import { ReactNode } from 'react'

interface Props {
	children: ReactNode
	heading: string
}

export function AuthPageWrapper({ children, heading }: Props) {
	return (
		<div className="min-h-screen flex flex-col items-center justify-center gap-8 px-4 py-10">
			<Logo height={40} />
			<div className="w-full max-w-sm rounded-lg border border-border bg-surface-raised p-6 shadow-card sm:p-8">
				<h1 className="mb-6">{heading}</h1>
				{children}
			</div>
		</div>
	)
}
