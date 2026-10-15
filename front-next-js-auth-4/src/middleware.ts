import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_PAGES } from './config/pages/admin.config'
import { KITCHEN_PAGES } from './config/pages/kitchen.config'
import { PUBLIC_PAGES } from './config/pages/public.config'
import { WAITER_PAGES } from './config/pages/waiter.config'
import { MANAGER_ROUTES } from './features/manager/config/manager.routes'
import { protectAdminPages } from './server-actions/middlewares/protect-admin.middleware'
import { protectKitchenPages } from './server-actions/middlewares/protect-kitchen.middleware'
import { protectLoginPages } from './server-actions/middlewares/protect-login.middleware'
import { protectManagerPages } from './server-actions/middlewares/protect-manager.middleware'
import { protectWaiterPages } from './server-actions/middlewares/protect-waiter.middleware'
import { nextRedirect } from './server-actions/middlewares/utils/next-redirect'
import { refreshAccessTokenIfNeeded } from './server-actions/middlewares/utils/refresh-access-token'
import { AuthToken } from './types/auth.types'

// Те же параметры, что у cookie, которую ставит фронт (auth-token.service)
const ACCESS_COOKIE_OPTIONS = {
	path: '/',
	sameSite: 'strict',
	maxAge: 60 * 60 * 24
} as const

export async function middleware(request: NextRequest): Promise<NextResponse> {
	const freshAccessToken = await refreshAccessTokenIfNeeded(request)
	const response = await protectRoute(request)

	if (freshAccessToken) {
		response.cookies.set(AuthToken.ACCESS_TOKEN, freshAccessToken, {
			...ACCESS_COOKIE_OPTIONS,
			secure:
				(request.headers.get('x-forwarded-proto') ||
					request.nextUrl.protocol.replace(':', '')) === 'https'
		})
	}

	return response
}

async function protectRoute(request: NextRequest): Promise<NextResponse> {
	const pathname = request.nextUrl.pathname

	// Отдельной главной нет: сайт начинается со входа, а вошедшего
	// страница входа сама отправит в кабинет его роли
	if (pathname === '/') {
		return nextRedirect(PUBLIC_PAGES.LOGIN, request.url)
	}

	if (pathname.startsWith(PUBLIC_PAGES.AUTH)) {
		return protectLoginPages(request)
	}

	if (pathname.startsWith(ADMIN_PAGES.HOME)) {
		return protectAdminPages(request)
	}

	if (pathname.startsWith(KITCHEN_PAGES.HOME)) {
		return protectKitchenPages(request)
	}

	if (pathname.startsWith(WAITER_PAGES.HOME)) {
		return protectWaiterPages(request)
	}

	if (pathname.startsWith(MANAGER_ROUTES.HOME)) {
		return protectManagerPages(request)
	}

	return NextResponse.next()
}

export const config = {
	matcher: [
		'/',
		'/auth/:path*',
		'/kitchen/:path*',
		'/admin/:path*',
		'/waiter/:path*',
		'/manager/:path*'
	]
}
