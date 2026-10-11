'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { LazyMotion, domAnimation } from 'framer-motion'
import { type PropsWithChildren, useState } from 'react'
import { Toaster } from 'react-hot-toast'

export function Providers({ children }: PropsWithChildren) {
	const [client] = useState(new QueryClient())

	return (
		<QueryClientProvider client={client}>
			<LazyMotion features={domAnimation}>{children}</LazyMotion>
			<Toaster
				toastOptions={{
					style: {
						background: 'var(--surface-raised)',
						color: 'var(--ink)',
						border: '1px solid var(--border)',
						borderRadius: 10,
						boxShadow: 'var(--shadow-popover)',
						fontSize: 15
					},
					success: {
						iconTheme: { primary: 'var(--accent)', secondary: 'var(--on-accent)' }
					},
					error: {
						iconTheme: { primary: 'var(--danger)', secondary: 'var(--surface-raised)' }
					}
				}}
			/>
			<ReactQueryDevtools initialIsOpen={false} />
		</QueryClientProvider>
	)
}
