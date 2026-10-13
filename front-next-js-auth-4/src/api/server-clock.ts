import type { AxiosInstance, AxiosResponse } from 'axios'

declare module 'axios' {
	interface InternalAxiosRequestConfig {
		sentAt?: number
	}
}

// Бэкенд ставит своё время в каждый ответ. Часы планшета или телефона могут
// отставать, поэтому все сроки годности считаются от серверного «сейчас»
const SERVER_TIME_HEADER = 'x-server-time'

// Серверное время минус время устройства
let offsetMs = 0

export const serverNow = () => Date.now() + offsetMs

function note(response: AxiosResponse | undefined) {
	const serverTime = Number(response?.headers?.[SERVER_TIME_HEADER])
	if (!response || !Number.isFinite(serverTime) || serverTime <= 0) return
	const receivedAt = Date.now()
	const sentAt = response.config?.sentAt ?? receivedAt
	// Сервер ответил примерно на середине пути запроса
	offsetMs = serverTime - (sentAt + receivedAt) / 2
}

export function trackServerTime(client: AxiosInstance) {
	client.interceptors.request.use(config => {
		config.sentAt = Date.now()
		return config
	})
	client.interceptors.response.use(
		response => {
			note(response)
			return response
		},
		error => {
			note(error?.response)
			return Promise.reject(error)
		}
	)
}
