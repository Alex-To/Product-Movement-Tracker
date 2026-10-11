import { API_URL } from '@/constants'
import authTokenService from '@/services/auth/auth-token.service'
import authService from '@/services/auth/auth.service'
import axios, { CreateAxiosDefaults } from 'axios'
import { getContentType } from './api.helper'

const axiosOptions: CreateAxiosDefaults = {
	baseURL: API_URL,
	headers: getContentType(),
	withCredentials: true
}

export const axiosClassic = axios.create(axiosOptions)

export const instance = axios.create(axiosOptions)

instance.interceptors.request.use(config => {
	const accessToken = authTokenService.getAccessToken()

	if (config?.headers && accessToken) {
		config.headers.Authorization = `Bearer ${accessToken}`
	}

	return config
})

instance.interceptors.response.use(
	config => config,
	async error => {
		const originalRequest = error.config

		// Без ответа (бэкенд недоступен) обновлять токен бессмысленно
		if (
			error.response?.status === 401 &&
			originalRequest &&
			!originalRequest._isRetry
		) {
			originalRequest._isRetry = true

			try {
				await authService.getNewTokens()
				return instance.request(originalRequest)
			} catch (refreshError) {
				if (
					axios.isAxiosError(refreshError) &&
					refreshError.response?.status === 401
				) {
					authTokenService.removeAccessToken()
				}
			}
		}

		throw error
	}
)
