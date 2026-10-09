import type { Metadata } from 'next'
import { JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { Providers } from './Providers'

const JetBrainsFont = JetBrains_Mono({
	subsets: ['cyrillic', 'latin'],
	weight: '400'
})

export const metadata: Metadata = {
	title: 'Product Movement Tracker',
	description: 'Учёт партий, сроков годности и стоп-листов'
}

export default function RootLayout({
	children
}: Readonly<{
	children: React.ReactNode
}>) {
	return (
		<html lang="ru">
			<body className={JetBrainsFont.className}>
				<Providers>
					<main className="flex min-h-screen flex-col items-center justify-between p-8">
						{children}
					</main>
				</Providers>
			</body>
		</html>
	)
}
