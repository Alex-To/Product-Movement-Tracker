'use client'

import { MiniLoader } from '@/components/ui/MiniLoader'
import { twMerge } from 'tailwind-merge'
import styles from './AuthForm.module.css'
import { useAuthForm } from './useAuthForm'

export function AuthForm() {
	const { handleSubmit, isLoading, onSubmit, register } = useAuthForm()

	return (
		<form
			onSubmit={handleSubmit(onSubmit)}
			className="max-w-sm mx-auto"
		>
			<div className="mb-4">
				<label className="text-gray-600">
					Логин
					<input
						type="text"
						placeholder="Введите логин"
						autoComplete="username"
						{...register('login', { required: true })}
						className={styles['input-field']}
					/>
				</label>
			</div>

			<div className="mb-6">
				<label className="text-gray-600">
					Пароль
					<input
						type="password"
						placeholder="Введите пароль"
						autoComplete="current-password"
						{...register('password', { required: true })}
						className={styles['input-field']}
					/>
				</label>
			</div>

			<div className="mb-3">
				<button
					type="submit"
					className={twMerge(
						styles['btn-primary'],
						'bg-primary',
						isLoading && 'opacity-75 cursor-not-allowed'
					)}
					disabled={isLoading}
				>
					{isLoading ? <MiniLoader /> : 'Войти'}
				</button>
			</div>
		</form>
	)
}
