import { twMerge } from 'tailwind-merge'

interface Props {
	height?: number
	className?: string
}

export function Logo({ height = 24, className }: Props) {
	const width = Math.round((height * 1024) / 265)

	return (
		<picture className={twMerge('block shrink-0', className)}>
			<source
				srcSet="/golubye-logo-inverse.png"
				media="(prefers-color-scheme: dark)"
			/>
			<img
				src="/golubye-logo.png"
				alt="Голубые"
				width={width}
				height={height}
				style={{ height, width: 'auto' }}
			/>
		</picture>
	)
}
