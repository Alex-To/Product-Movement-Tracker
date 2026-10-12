import { twMerge } from '@/utils/tw-merge'

// Лоадер «ДуДоС пицца» из брендбука (brand/loader, контуры знака без изменений).
// Пицца поворачивается на кусок, золотой кусок въезжает в паз и темнеет,
// а сосед вылетает на его место и становится золотым — так по кругу.
// Анимация — классы .pizza-* в globals.css. Основной цвет — currentColor:
// графит в светлой теме, крем в тёмной и на графитовой кнопке.
// При prefers-reduced-motion остаётся статичный знак

// Куски (клин + своя дырка пепперони), которые в анимации стоят на месте
const SLICES = [
	'M114,146L205.8,152.4A92,92 0 0 1 183.4,206.4ZM158.8,167.7a9,9 0 1,0 18,0a9,9 0 1,0 -18,0Z',
	'M114,146L174.4,215.4A92,92 0 0 1 120.4,237.8ZM127.7,199.4a9,9 0 1,0 18,0a9,9 0 1,0 -18,0Z',
	'M114,146L107.6,237.8A92,92 0 0 1 53.6,215.4ZM83.3,199.8a9,9 0 1,0 18,0a9,9 0 1,0 -18,0Z',
	'M114,146L44.6,206.4A92,92 0 0 1 22.2,152.4ZM51.6,168.7a9,9 0 1,0 18,0a9,9 0 1,0 -18,0Z',
	'M114,146L22.2,139.6A92,92 0 0 1 44.6,85.6ZM51.2,124.3a9,9 0 1,0 18,0a9,9 0 1,0 -18,0Z',
	'M114,146L53.6,76.6A92,92 0 0 1 107.6,54.2ZM82.3,92.6a9,9 0 1,0 18,0a9,9 0 1,0 -18,0Z'
]
// Улетевший золотой кусок и его сосед по часовой стрелке, который вылетит следующим
const FLYING =
	'M138,112L144.4,20.2A92,92 0 0 1 198.4,42.6ZM150.7,58.2a9,9 0 1,0 18,0a9,9 0 1,0 -18,0Z'
const NEXT =
	'M114,146L183.4,85.6A92,92 0 0 1 205.8,139.6ZM158.4,123.3a9,9 0 1,0 18,0a9,9 0 1,0 -18,0Z'

const RATIO = 242 / 246

interface Props {
	/** Ширина в px: 20–24 в кнопке, 48 в блоке, 96 на всю страницу */
	size?: number
	className?: string
}

export function PizzaLoader({ size = 48, className }: Props) {
	const height = Math.round(size * RATIO)

	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="12 10 246 242"
			width={size}
			height={height}
			aria-hidden
			className={twMerge('inline-block shrink-0 align-middle', className)}
		>
			<g
				fill="currentColor"
				fillRule="evenodd"
				className="pizza-turn"
			>
				{SLICES.map(d => (
					<path
						key={d}
						d={d}
					/>
				))}
				<path
					d={FLYING}
					className="pizza-slice-in fill-gold"
				/>
				<path
					d={NEXT}
					className="pizza-slice-out"
				/>
			</g>
		</svg>
	)
}

interface LoadingProps {
	/** Подпись под пиццей; без неё — только для экранных читалок */
	label?: string
	size?: number
	className?: string
}

// Состояние загрузки блока или страницы: пицца по центру и подпись
export function Loading({ label, size = 48, className }: LoadingProps) {
	return (
		<div
			role="status"
			className={twMerge(
				'flex flex-col items-center justify-center gap-3 py-10 text-ink',
				className
			)}
		>
			<PizzaLoader size={size} />
			{label ? (
				<p className="text-caption text-ink-muted">{label}</p>
			) : (
				<span className="sr-only">Загрузка…</span>
			)}
		</div>
	)
}
