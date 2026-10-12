'use client'

import { PizzaLoader } from '@/components/ui/PizzaLoader'
import { twMerge } from '@/utils/tw-merge'
import styles from './AuthForm.module.css'
import { useAuthForm } from './useAuthForm'

export function AuthForm() {
	const { handleSubmit, isLoading, onSubmit, register } = useAuthForm()

	return (
		<form
			onSubmit={handleSubmit(onSubmit)}
			className="w-full"
		>
			<div className="mb-4">
				<label className="text-caption font-semibold text-ink">
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
				<label className="text-caption font-semibold text-ink">
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

			<div>
				<button
					type="submit"
					className={twMerge(
						styles['btn-primary'],
						'bg-accent',
						isLoading && 'opacity-75 cursor-not-allowed'
					)}
					disabled={isLoading}
				>
					{isLoading ? <PizzaLoader size={26} /> : 'Войти'}
				</button>
			</div>
		</form>
	)
}
