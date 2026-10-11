import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/onest/400.css'
import '@fontsource/onest/500.css'
import '@fontsource/onest/600.css'
import '@fontsource/onest/700.css'
import type { Metadata } from 'next'
import { THEME_INIT_SCRIPT } from '@/components/ui/theme'
import './globals.css'
import { Providers } from './Providers'

export const metadata: Metadata = {
	title: 'ДуДоС · учёт продуктов',
	description: 'Учёт партий, сроков годности и стоп-листов'
}

export default function RootLayout({
	children
}: Readonly<{
	children: React.ReactNode
}>) {
	return (
		// Тему ставит скрипт до отрисовки, поэтому атрибут на сервере и клиенте расходится
		<html
			lang="ru"
			suppressHydrationWarning
		>
			<head>
				<script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
			</head>
			<body>
				<Providers>
					<main className="min-h-screen">{children}</main>
				</Providers>
			</body>
		</html>
	)
}
