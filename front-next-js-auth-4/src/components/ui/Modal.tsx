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
					className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					onClick={handleBackdropClick}
				>
					<m.div
						className="bg-zinc-900 p-6 rounded-lg shadow-lg w-full max-w-sm relative"
						initial={{ scale: 0.8 }}
						animate={{ scale: 1 }}
						exit={{ scale: 0.8 }}
					>
						<button
							onClick={onClose}
							className="absolute top-0 right-2 text-gray-500 hover:text-gray-700"
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
