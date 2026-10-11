'use client'

import { Button } from '@/components/ui/Button'
import { MiniLoader } from '@/components/ui/MiniLoader'
import { ROLE_LABELS } from '@/config/pages/role.config'
import { UserRole } from '@/types/auth.types'
import {
	IAdminUserCreateData,
	IAdminUserUpdateData,
	TAssignableRole
} from '@/types/admin.types'
import { IUser } from '@/types/user.types'
import { useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { useSaveUser } from './useUserMutations'

const ASSIGNABLE_ROLES: TAssignableRole[] = [
	UserRole.MANAGER,
	UserRole.WAITER,
	UserRole.KITCHEN
]

interface IFormValues {
	name: string
	login: string
	password: string
	role: TAssignableRole
}

interface Props {
	user: IUser | null
	onClose: () => void
}

const labelClass = 'text-caption font-semibold text-ink'

const inputClass =
	'mt-1.5 min-h-11 w-full rounded-sm border border-border-strong bg-surface-raised px-3 text-ink placeholder:text-ink-muted transition-colors focus:border-accent focus:outline-2 focus:outline-offset-0 focus:outline-accent/25 disabled:cursor-not-allowed disabled:border-border disabled:bg-stop-tint disabled:text-ink-muted aria-invalid:border-danger'

export function UserForm({ user, onClose }: Props) {
	const isEdit = !!user
	const isAdminUser = user?.role === UserRole.ADMIN
	const formId = useId()
	const [serverError, setServerError] = useState<string | null>(null)

	const {
		register,
		handleSubmit,
		formState: { errors }
	} = useForm<IFormValues>({
		defaultValues: {
			name: user?.name ?? '',
			login: user?.login ?? '',
			password: '',
			role: isAdminUser
				? UserRole.WAITER
				: ((user?.role as TAssignableRole) ?? UserRole.WAITER)
		}
	})

	const { mutate, isPending } = useSaveUser(user?.id ?? null, {
		onSuccess() {
			toast.success(isEdit ? 'Изменения сохранены' : 'Сотрудник добавлен')
			onClose()
		},
		onError: setServerError
	})

	const onSubmit = (values: IFormValues) => {
		setServerError(null)

		const data: IAdminUserCreateData | IAdminUserUpdateData = {
			name: values.name.trim(),
			login: values.login.trim()
		}
		if (values.password) data.password = values.password
		if (!isAdminUser) data.role = values.role

		mutate(data)
	}

	return (
		<form
			onSubmit={handleSubmit(onSubmit)}
			className="space-y-5"
			noValidate
		>
			<h2>
				{isEdit ? 'Изменить сотрудника' : 'Новый сотрудник'}
			</h2>

			<div>
				<label
					htmlFor={`${formId}-name`}
					className={labelClass}
				>
					Имя
				</label>
				<input
					id={`${formId}-name`}
					placeholder="Как показывать в интерфейсе"
					autoComplete="off"
					aria-invalid={!!errors.name}
					className={inputClass}
					{...register('name', {
						validate: value => !!value.trim() || 'Укажите имя'
					})}
				/>
				<FieldError message={errors.name?.message} />
			</div>

			<div>
				<label
					htmlFor={`${formId}-login`}
					className={labelClass}
				>
					Логин
				</label>
				<input
					id={`${formId}-login`}
					placeholder="Уникальный"
					autoComplete="off"
					aria-invalid={!!errors.login}
					className={inputClass}
					{...register('login', {
						validate: value =>
							value.trim().length >= 3 || 'Логин — не короче 3 символов'
					})}
				/>
				<FieldError message={errors.login?.message} />
			</div>

			<div>
				<label
					htmlFor={`${formId}-password`}
					className={labelClass}
				>
					Пароль
				</label>
				<input
					id={`${formId}-password`}
					type="password"
					placeholder={
						isEdit ? 'Пусто — не менять' : 'Не короче 6 символов'
					}
					autoComplete="new-password"
					aria-invalid={!!errors.password}
					className={inputClass}
					{...register('password', {
						validate: value =>
							(isEdit && !value) ||
							value.length >= 6 ||
							'Пароль — не короче 6 символов'
					})}
				/>
				<FieldError message={errors.password?.message} />
			</div>

			<div>
				<label
					htmlFor={`${formId}-role`}
					className={labelClass}
				>
					Роль
				</label>
				{isAdminUser ? (
					<select
						id={`${formId}-role`}
						disabled
						className={inputClass}
					>
						<option>{ROLE_LABELS.ADMIN} (ADMIN)</option>
					</select>
				) : (
					<select
						id={`${formId}-role`}
						className={inputClass}
						{...register('role')}
					>
						{ASSIGNABLE_ROLES.map(role => (
							<option
								key={role}
								value={role}
							>
								{ROLE_LABELS[role]} ({role})
							</option>
						))}
					</select>
				)}
				<p className="mt-1.5 text-caption text-ink-muted">
					{isAdminUser
						? 'Роль администратора не меняется.'
						: 'Роль ADMIN назначить нельзя: администратор в системе один, заводится сидом.'}
				</p>
			</div>

			{serverError && (
				<p
					role="alert"
					className="rounded-sm bg-danger-tint px-3 py-2 text-caption text-danger"
				>
					{serverError}
				</p>
			)}

			<div className="flex gap-2 pt-1">
				<Button
					type="submit"
					disabled={isPending}
					className="min-w-28"
				>
					{isPending ? (
						<MiniLoader
							width={22}
							height={22}
						/>
					) : (
						'Сохранить'
					)}
				</Button>
				<Button
					variant="ghost"
					onClick={onClose}
					disabled={isPending}
				>
					Отмена
				</Button>
			</div>
		</form>
	)
}

function FieldError({ message }: { message?: string }) {
	if (!message) return null
	return <p className="mt-1.5 text-caption text-danger">{message}</p>
}
