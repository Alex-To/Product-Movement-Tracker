'use client'

import { useId, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useServerNow } from '@/hooks/useServerNow'
import { serverNow } from '@/api/server-clock'
import { managerError } from '../api/manager.api'
import { catalogInput, catalogLabel } from '../products/styles'
import { dishesApi, dishKeys, type ManagerDish } from './dishes.api'
import {
	formatManualHotUntil,
	manualHotInput,
	manualHotIso
} from './manual-hot-time'

export function ManualHotControl({
	dish,
	userId
}: {
	dish: ManagerDish
	userId: string
}) {
	const client = useQueryClient()
	const id = useId()
	const now = useServerNow()
	const [open, setOpen] = useState(false)
	const [until, setUntil] = useState('')
	const [timed, setTimed] = useState(false)
	const [error, setError] = useState('')
	const active =
		dish.manualHotActive &&
		(dish.manualHotUntil === null || Date.parse(dish.manualHotUntil) > now)
	const unavailable =
		dish.autoStop ||
		dish.manualStop ||
		dish.portions <= 0 ||
		!dish.ingredients.length
	const automatic = dish.hotSource === 'AUTO'
	const refresh = async () => {
		await Promise.all([
			client.invalidateQueries({ queryKey: dishKeys.all }),
			client.invalidateQueries({
				queryKey: ['manager', 'hot-preview', userId]
			}),
			client.invalidateQueries({
				queryKey: ['manager', 'statistics', userId, 'hot']
			}),
			client.invalidateQueries({ queryKey: ['waiter', 'menu'] })
		])
	}
	const save = useMutation({
		mutationFn: (expiresAt: string | null) =>
			dishesApi.setManualHot(dish.id, expiresAt),
		async onSuccess() {
			setOpen(false)
			await refresh()
			toast.success('Ручное горячее предложение сохранено')
		},
		onError(e) {
			setError(managerError(e))
			void refresh()
		}
	})
	const remove = useMutation({
		mutationFn: () => dishesApi.removeManualHot(dish.id),
		async onSuccess() {
			await refresh()
			toast.success('Ручное назначение снято')
		},
		onError(e) {
			toast.error(managerError(e))
			void refresh()
		}
	})
	if (dish.deletedAt) return null
	const busy = save.isPending || remove.isPending
	const submit = (event: FormEvent) => {
		event.preventDefault()
		try {
			const iso = timed ? manualHotIso(until) : null
			if (iso && Date.parse(iso) <= serverNow())
				throw new Error('Выберите будущее время окончания')
			setError('')
			save.mutate(iso)
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Проверьте время окончания')
		}
	}
	return (
		<div className="my-3 rounded-md bg-tint p-3 text-caption">
			{active ? (
				<>
					<p className="font-semibold text-fire-ink">
						{dish.manualHotUntil
							? `Вручную до ${formatManualHotUntil(dish.manualHotUntil)}`
							: 'Вручную · без срока'}
					</p>
					{unavailable && (
						<p className="mt-1 text-ink-muted">
							{dish.manualStop
								? 'Ручной стоп кухни.'
								: 'Нет доступных порций или действует AUTO-стоп.'}{' '}
							Назначение сохранено: блюдо вернётся в горячие после
							восстановления доступности
							{dish.manualHotUntil ? ' до указанного срока' : ''}.
						</p>
					)}
				</>
			) : automatic ? (
				<p className="font-semibold text-fire-ink">Выбрано автоматически</p>
			) : (
				<p className="text-ink-muted">
					Ручное горячее предложение
					{unavailable ? ': сейчас блюдо недоступно.' : ''}
				</p>
			)}
			<div className="mt-2 flex flex-wrap gap-2">
				<Button
					size="sm"
					variant="secondary"
					disabled={busy || (!active && (automatic || unavailable))}
					onClick={() => {
						setTimed(active && dish.manualHotUntil !== null)
						setUntil(
							active && dish.manualHotUntil
								? manualHotInput(dish.manualHotUntil)
								: ''
						)
						setError('')
						setOpen(true)
					}}
					aria-label={`${active ? 'Изменить срок горячего предложения' : 'Добавить в горячие'}: ${dish.name}`}
				>
					{active ? 'Изменить срок' : 'В горячие'}
				</Button>
				{active && (
					<Button
						size="sm"
						variant="ghost"
						disabled={busy}
						onClick={() => remove.mutate()}
					>
						Снять ручное
					</Button>
				)}
			</div>
			<Modal
				isOpen={open}
				onClose={() => {
					if (!busy) setOpen(false)
				}}
			>
				<form onSubmit={submit} className="space-y-4">
					<h2 className="pr-8">Горячее предложение · {dish.name}</h2>
					<fieldset disabled={busy} className="space-y-2">
						<legend className={catalogLabel}>Срок действия</legend>
						<label className="flex items-center gap-2">
							<input
								type="radio"
								name={`${id}-mode`}
								checked={!timed}
								onChange={() => setTimed(false)}
							/>
							Без срока
						</label>
						<label className="flex items-center gap-2">
							<input
								type="radio"
								name={`${id}-mode`}
								checked={timed}
								onChange={() => setTimed(true)}
							/>
							До даты и времени
						</label>
					</fieldset>
					{timed && (
						<>
							<label className={catalogLabel} htmlFor={id}>
								Дата и время окончания
							</label>
							<input
								id={id}
								type="datetime-local"
								required
								value={until}
								disabled={busy}
								className={catalogInput}
								min={manualHotInput(new Date(now).toISOString())}
								onChange={(event) => setUntil(event.target.value)}
							/>
						</>
					)}
					{!timed && (
						<p className="text-caption text-ink-muted">
							Действует, пока менеджер не снимет ручное назначение.
						</p>
					)}
					<p className="text-caption text-ink-muted">
						Время ресторана: Europe/Simferopol (UTC+3). Назначение действует
						сразу и добавляется сверх автоматического лимита. Стоп-лист и
						остатки сохраняют приоритет.
					</p>
					{error && (
						<p role="alert" className="text-danger">
							{error}
						</p>
					)}
					<Button type="submit" disabled={busy}>
						{busy ? 'Сохраняем…' : 'Сохранить'}
					</Button>
				</form>
			</Modal>
		</div>
	)
}
