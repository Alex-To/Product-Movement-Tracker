'use server'

import { type NextRequest, NextResponse } from 'next/server'

import { ADMIN_PAGES } from '@/config/pages/admin.config'
import { getTokensFromRequest } from './utils/get-tokens-from-request'
import { jwtVerifyServer } from './utils/jwt-verify'
import { redirectToLoginOrNotFound } from './utils/redirect-to-login-or-404'

export async function protectAdminPages(request: NextRequest) {
	const tokens = await getTokensFromRequest(request)
	if (!tokens) return redirectToLoginOrNotFound(request)

	const verifiedData = await jwtVerifyServer(tokens.accessToken)
	if (!verifiedData) return redirectToLoginOrNotFound(request)

	const pathname = request.nextUrl.pathname

	if (pathname.startsWith(ADMIN_PAGES.HOME) && !verifiedData?.isAdmin)
		return redirectToLoginOrNotFound(request)

	if (
		pathname.startsWith(ADMIN_PAGES.MANAGER) &&
		!verifiedData?.isManager &&
		!verifiedData?.isAdmin
	) {
		return redirectToLoginOrNotFound(request)
	}

	return NextResponse.next()
}
