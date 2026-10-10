import { PUBLIC_PAGES } from '@/config/pages/public.config'
import { NextRequest } from 'next/server'
import { nextRedirect } from './next-redirect'

export const redirectToLoginOrNotFound = (request: NextRequest) => {
	return nextRedirect(PUBLIC_PAGES.LOGIN, request.url)
}
