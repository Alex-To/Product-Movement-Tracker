import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/onest/400.css'
import '@fontsource/onest/500.css'
import '@fontsource/onest/600.css'
import '@fontsource/unbounded/600.css'
import '@fontsource/unbounded/700.css'
import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './Providers'

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
			<body>
				<Providers>
					<main className="min-h-screen">{children}</main>
				</Providers>
			</body>
		</html>
	)
}
