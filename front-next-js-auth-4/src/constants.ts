// Production uses the same origin: Nginx routes /api and /uploads to NestJS.
const BACKEND_MAIN =
	process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, '') ??
	(process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4200')
export const BACKEND_URL = BACKEND_MAIN
export const API_URL = `${BACKEND_MAIN}/api`
export const BACKEND_SOCIAL_AUTH_URL = `${BACKEND_MAIN}/auth`
export const TG_AUTH_REDIRECT_URL = `${BACKEND_SOCIAL_AUTH_URL}/telegram/redirect`
