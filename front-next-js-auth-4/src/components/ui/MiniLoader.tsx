import Image from 'next/image'

interface Props {
	isDark?: boolean
	width?: number
	height?: number
}

export function MiniLoader({
	isDark = false,
	height = 30,
	width = 30,
	...rest
}: Props) {
	return (
		<Image
			src={isDark ? '/dark-loader.svg' : '/loader.svg'}
			width={width}
			height={height}
			priority
			alt=""
			className="mx-auto"
			{...rest}
		/>
	)
}
