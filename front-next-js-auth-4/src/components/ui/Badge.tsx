import { type ReactNode } from 'react'
import { twMerge } from '@/utils/tw-merge'

interface Props {
	variant: 'fire' | 'stop' | 'live' | 'error'
	icon?: ReactNode
	children: ReactNode
	className?: string
}

const VARIANTS = {
	fire: 'bg-fire-tint text-fire-ink',
	stop: 'bg-stop-tint text-stop-ink',
	live: 'bg-tint text-ink',
	error: 'bg-danger-tint text-danger'
}

export function Badge({ variant, icon, children, className }: Props) {
	return (
		<span
			className={twMerge(
				'inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-label font-semibold tracking-[0.04em] whitespace-nowrap uppercase [&_svg]:size-3.5',
				VARIANTS[variant],
				className
			)}
		>
			{icon}
			{children}
		</span>
	)
}
