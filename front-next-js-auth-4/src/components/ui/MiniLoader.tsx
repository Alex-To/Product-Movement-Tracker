import { twMerge } from '@/utils/tw-merge'

interface Props {
	isDark?: boolean
	width?: number
	height?: number
	className?: string
}

// Пульсирующее кольцо цветом текста родителя: видно и на графитовой кнопке
// светлой темы, и на кремовой кнопке тёмной
export function MiniLoader({ isDark = false, height = 30, width = 30, className }: Props) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 200 200"
			width={width}
			height={height}
			aria-hidden
			className={twMerge('mx-auto block', isDark && 'text-ink', className)}
		>
			<circle
				fill="none"
				stroke="currentColor"
				strokeOpacity="1"
				strokeWidth=".5"
				cx="100"
				cy="100"
				r="0"
			>
				<animate
					attributeName="r"
					calcMode="spline"
					dur="2"
					values="1;80"
					keyTimes="0;1"
					keySplines="0 .2 .5 1"
					repeatCount="indefinite"
				/>
				<animate
					attributeName="stroke-width"
					calcMode="spline"
					dur="2"
					values="0;25"
					keyTimes="0;1"
					keySplines="0 .2 .5 1"
					repeatCount="indefinite"
				/>
				<animate
					attributeName="stroke-opacity"
					calcMode="spline"
					dur="2"
					values="1;0"
					keyTimes="0;1"
					keySplines="0 .2 .5 1"
					repeatCount="indefinite"
				/>
			</circle>
		</svg>
	)
}
