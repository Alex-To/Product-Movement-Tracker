import { errorCatch } from '@/api/api.helper'
import adminService from '@/services/admin.service'
import {
	IAdminUserCreateData,
	IAdminUserUpdateData
} from '@/types/admin.types'
import { useMutation, useQueryClient } from '@tanstack/react-query'

export const USERS_QUERY_KEY = ['admin', 'users']

interface IOptions {
	onSuccess?: () => void
	onError?: (message: string) => void
}

export function useSaveUser(userId: string | null, options: IOptions) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationKey: ['save user', userId],
		mutationFn: (data: IAdminUserCreateData | IAdminUserUpdateData) =>
			userId
				? adminService.updateUser(userId, data)
				: adminService.createUser(data as IAdminUserCreateData),
		async onSuccess() {
			await queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY })
			await queryClient.invalidateQueries({ queryKey: ['profile'] })
			options.onSuccess?.()
		},
		onError(error) {
			options.onError?.(errorCatch(error))
		}
	})
}

export function useDeleteUser(options: IOptions) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationKey: ['delete user'],
		mutationFn: (id: string) => adminService.deleteUser(id),
		async onSuccess() {
			await queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY })
			options.onSuccess?.()
		},
		onError(error) {
			options.onError?.(errorCatch(error))
		}
	})
}
