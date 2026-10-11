import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_PAGES } from './config/pages/admin.config'
import { DASHBOARD_PAGES } from './config/pages/dashboard.config'
import { KITCHEN_PAGES } from './config/pages/kitchen.config'
import { PUBLIC_PAGES } from './config/pages/public.config'
import { WAITER_PAGES } from './config/pages/waiter.config'
import { protectAdminPages } from './server-actions/middlewares/protect-admin.middleware'
import { protectDashboardPages } from './server-actions/middlewares/protect-dashboard.middleware'
import { protectKitchenPages } from './server-actions/middlewares/protect-kitchen.middleware'
import { protectLoginPages } from './server-actions/middlewares/protect-login.middleware'
import { protectWaiterPages } from './server-actions/middlewares/protect-waiter.middleware'

export async function middleware(request: NextRequest): Promise<NextResponse> {
	const pathname = request.nextUrl.pathname

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

	if (pathname.startsWith(DASHBOARD_PAGES.HOME)) {
		return protectDashboardPages(request)
	}

	return NextResponse.next()
}

export const config = {
	matcher: [
		'/dashboard/:path*',
		'/auth/:path*',
		'/kitchen/:path*',
		'/admin/:path*',
		'/waiter/:path*'
	]
}
