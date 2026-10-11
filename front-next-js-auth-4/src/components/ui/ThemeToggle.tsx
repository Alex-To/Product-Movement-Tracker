'use client'

import { TbMoon, TbSun } from 'react-icons/tb'
import { twMerge } from '@/utils/tw-merge'
import { THEME_STORAGE_KEY } from './theme'

export function ThemeToggle({ className }: { className?: string }) {
	const toggle = () => {
		const root = document.documentElement
		const next = root.dataset.theme === 'dark' ? 'light' : 'dark'
		root.dataset.theme = next
		try {
			localStorage.setItem(THEME_STORAGE_KEY, next)
		} catch {
			// Без хранилища тема просто не запомнится
		}
	}

	return (
		<button
			type="button"
			onClick={toggle}
			aria-label="Переключить тему"
			title="Светлая или тёмная тема"
			className={twMerge(
				'inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border-strong bg-surface-raised text-ink transition-colors hover:bg-tint sm:size-11',
				'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
				className
			)}
		>
			<TbMoon
				size={18}
				aria-hidden
				className="dark:hidden"
			/>
			<TbSun
				size={18}
				aria-hidden
				className="hidden dark:block"
			/>
		</button>
	)
}
