import { twMerge } from 'tailwind-merge'

interface Props {
	// Высота в px; в шапке — 24
	height?: number
	className?: string
}

// Логотип «Голубые»: на светлом фоне — основной, в тёмной теме — со светлой сноской
export function Logo({ height = 24, className }: Props) {
	// Исходник 1024×265
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
