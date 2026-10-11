'use client'

import { errorCatch } from '@/api/api.helper'
import { getRoleHomePage } from '@/config/pages/role.config'
import authService from '@/services/auth/auth.service'
import { IFormData } from '@/types/auth.types'
import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { SubmitHandler, useForm } from 'react-hook-form'
import toast from 'react-hot-toast'

export function useAuthForm() {
	const { register, handleSubmit, reset } = useForm<IFormData>()

	const router = useRouter()
	const [isPending, startTransition] = useTransition()

	const { mutate: mutateLogin, isPending: isLoginPending } = useMutation({
		mutationKey: ['login'],
		mutationFn: (data: IFormData) => authService.login(data),
		onSuccess({ data }) {
			startTransition(() => {
				reset()
				router.push(getRoleHomePage(data.user.role))
			})
		},
		onError(error) {
			toast.error(errorCatch(error))
		}
	})

	const onSubmit: SubmitHandler<IFormData> = data => {
		mutateLogin(data)
	}

	const isLoading = isPending || isLoginPending

	return {
		register,
		handleSubmit,
		onSubmit,
		isLoading
	}
}
