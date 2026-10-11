'use client'

import { AnimatePresence, m } from 'framer-motion'
import { type MouseEvent, type ReactNode } from 'react'

interface Props {
	isOpen: boolean
	onClose: () => void
	children: ReactNode
}

export function Modal({ isOpen, onClose, children }: Props) {
	const handleBackdropClick = (e: MouseEvent) => {
		if (e.target === e.currentTarget) {
			onClose()
		}
	}

	return (
		<AnimatePresence>
			{isOpen && (
				<m.div
					className="fixed inset-0 z-50 flex items-center justify-center bg-[#04122b]/55"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					onClick={handleBackdropClick}
				>
					<m.div
						role="dialog"
						aria-modal="true"
						className="relative w-[calc(100%-2rem)] max-w-md rounded-lg border border-border bg-surface-raised p-6 text-ink shadow-popover"
						initial={{ scale: 0.8 }}
						animate={{ scale: 1 }}
						exit={{ scale: 0.8 }}
					>
						<button
							onClick={onClose}
							aria-label="Закрыть"
							className="absolute top-4 right-4 flex size-8 items-center justify-center rounded-sm text-ink-muted hover:bg-tint hover:text-ink cursor-pointer"
						>
							✕
						</button>
						{children}
					</m.div>
				</m.div>
			)}
		</AnimatePresence>
	)
}
