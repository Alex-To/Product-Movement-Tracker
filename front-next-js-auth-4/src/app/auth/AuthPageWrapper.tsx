import { Logo } from '@/components/ui/Logo'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { ReactNode } from 'react'

interface Props {
	children: ReactNode
	heading: string
}

export function AuthPageWrapper({ children, heading }: Props) {
	return (
		<div className="relative flex min-h-screen flex-col items-center justify-center gap-8 overflow-hidden px-4 py-20 sm:gap-10">
			{/* Кнопка темы — в той же точке, что и в шапках кабинетов */}
			<div className="absolute inset-x-0 top-0 z-10">
				<div className="mx-auto flex max-w-7xl justify-end px-3 py-3 sm:px-6">
					<ThemeToggle />
				</div>
			</div>

			{/* Тонкие золотые линии — декор из брендбука */}
			<svg
				aria-hidden
				viewBox="0 0 420 300"
				fill="none"
				className="pointer-events-none absolute top-24 -right-24 w-64 sm:-right-10 sm:w-[420px]"
			>
				<path
					d="M40 260 L150 40 L210 150 L390 70 L330 260 Z"
					stroke="var(--gold)"
					strokeWidth="2"
					strokeLinejoin="round"
				/>
			</svg>
			<svg
				aria-hidden
				viewBox="0 0 300 220"
				fill="none"
				className="pointer-events-none absolute bottom-16 -left-16 hidden w-[300px] sm:block"
			>
				<path
					d="M20 200 L80 30 L150 120 L280 60 L250 200 Z"
					stroke="var(--gold)"
					strokeWidth="2"
					strokeLinejoin="round"
				/>
			</svg>

			<Logo
				variant="stacked"
				className="relative h-[207px] w-auto sm:h-[253px]"
			/>
			<div className="relative w-full max-w-[440px] rounded-lg bg-surface-raised p-7 shadow-popover sm:p-10">
				<h1 className="mb-6">{heading}</h1>
				{children}
			</div>
		</div>
	)
}
