'use client'

import { errorCatch } from '@/api/api.helper'
import { getRoleHomePage } from '@/config/pages/role.config'
import authService from '@/services/auth/auth.service'
import { IFormData } from '@/types/auth.types'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { SubmitHandler, useForm } from 'react-hook-form'
import toast from 'react-hot-toast'

export function useAuthForm() {
	const { register, handleSubmit, reset } = useForm<IFormData>()

	const queryClient = useQueryClient()

	const { mutate: mutateLogin, isPending: isLoginPending } = useMutation({
		mutationKey: ['login'],
		mutationFn: (data: IFormData) => authService.login(data),
		async onSuccess({ data }) {
			await queryClient.cancelQueries()
			queryClient.clear()
			reset()
			// A new session must not reuse the previous employee's router cache.
			window.location.replace(getRoleHomePage(data.user.role))
		},
		onError(error) {
			toast.error(errorCatch(error))
		}
	})

	const onSubmit: SubmitHandler<IFormData> = data => {
		mutateLogin(data)
	}

	const isLoading = isLoginPending

	return {
		register,
		handleSubmit,
		onSubmit,
		isLoading
	}
}
