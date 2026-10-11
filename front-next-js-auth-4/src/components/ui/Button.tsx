import { type ButtonHTMLAttributes } from 'react'
import { twMerge } from '@/utils/tw-merge'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: 'primary' | 'secondary' | 'ghost'
	size?: 'sm' | 'md'
}

const VARIANTS = {
	primary: 'bg-accent text-on-accent hover:bg-accent-hover',
	secondary:
		'bg-surface-raised text-ink border-border-strong hover:bg-tint',
	ghost: 'bg-transparent text-accent hover:bg-tint'
}

const SIZES = {
	sm: 'min-h-9 px-4 text-caption',
	md: 'min-h-11 px-5 text-body'
}

export function Button({
	variant = 'primary',
	size = 'md',
	className,
	type = 'button',
	...rest
}: Props) {
	return (
		<button
			type={type}
			className={twMerge(
				'inline-flex items-center justify-center gap-2 rounded-full border border-transparent font-semibold whitespace-nowrap transition-colors cursor-pointer',
				'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
				'disabled:cursor-not-allowed disabled:border-transparent disabled:bg-stop-tint disabled:text-ink-muted',
				VARIANTS[variant],
				SIZES[size],
				className
			)}
			{...rest}
		/>
	)
}
