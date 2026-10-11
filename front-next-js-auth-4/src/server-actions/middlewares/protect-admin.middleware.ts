'use server'

import { type NextRequest, NextResponse } from 'next/server'

import { getTokensFromRequest } from './utils/get-tokens-from-request'
import { jwtVerifyServer } from './utils/jwt-verify'
import { nextRedirect } from './utils/next-redirect'
import { redirectToLoginOrNotFound } from './utils/redirect-to-login-or-404'

export async function protectAdminPages(request: NextRequest) {
	const tokens = await getTokensFromRequest(request)
	if (!tokens) return redirectToLoginOrNotFound(request)

	const verifiedData = await jwtVerifyServer(tokens.accessToken)
	if (!verifiedData) return redirectToLoginOrNotFound(request)

	if (!verifiedData.isAdmin) return nextRedirect('/404', request.url)

	return NextResponse.next()
}
