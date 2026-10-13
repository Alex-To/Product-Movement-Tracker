'use client'
import { Button } from '@/components/ui/Button'
import { Loading } from '@/components/ui/PizzaLoader'
import { twMerge } from '@/utils/tw-merge'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, type ReactNode, useState } from 'react'
import toast from 'react-hot-toast'
import { TbFlame } from 'react-icons/tb'
import { managerError } from '../api/manager.api'
import { ManagerAccess } from '../components/ManagerAccess'
import { catalogInput, catalogLabel } from '../products/styles'
import { HotPreview } from './HotPreview'
import {
	DEFAULT_SETTINGS,
	type RestaurantSettings,
	type SavedSettings,
	settingsApi,
	settingsKeys,
	urgentWindowHours
} from './settings.api'

type Field =
	| 'cookReserveMinutes'
	| 'urgentPercent'
	| 'urgentMinHours'
	| 'urgentMaxDays'
	| 'hotLimit'
	| 'demandDays'
type Draft = Record<Field, string>

// Подписи и пределы — те же, что проверяет бэкенд
const FIELDS: Record<Field, { label: string; min: number; max: number }> = {
	cookReserveMinutes: { label: 'Запас на готовку', min: 0, max: 240 },
	urgentPercent: { label: 'Доля срока хранения', min: 1, max: 100 },
	urgentMinHours: { label: 'Не меньше чем за', min: 0, max: 720 },
	urgentMaxDays: { label: 'Не больше чем за', min: 1, max: 90 },
	hotLimit: { label: 'Сколько блюд отмечать', min: 0, max: 10 },
	demandDays: { label: 'Спрос считать за', min: 1, max: 90 }
}

const toDraft = (settings: RestaurantSettings): Draft => ({
	cookReserveMinutes: String(settings.cookReserveMinutes),
	urgentPercent: String(settings.urgentPercent),
	urgentMinHours: String(settings.urgentMinHours),
	urgentMaxDays: String(Math.round(settings.urgentMaxHours / 24)),
	hotLimit: String(settings.hotLimit),
	demandDays: String(settings.demandDays)
})

function parse(draft: Draft): { value: RestaurantSettings } | { error: string } {
	const numbers = {} as Record<Field, number>
	for (const field of Object.keys(FIELDS) as Field[]) {
		const { label, min, max } = FIELDS[field]
		const raw = draft[field].trim()
		if (!/^\d+$/.test(raw)) return { error: `${label}: введите целое число` }
		const value = Number(raw)
		if (value < min || value > max)
			return { error: `${label}: от ${min} до ${max}` }
		numbers[field] = value
	}
	if (numbers.urgentMaxDays * 24 < numbers.urgentMinHours)
		return { error: 'Верхняя граница срочности не может быть меньше нижней' }
	return {
		value: {
			cookReserveMinutes: numbers.cookReserveMinutes,
			urgentPercent: numbers.urgentPercent,
			urgentMinHours: numbers.urgentMinHours,
			urgentMaxHours: numbers.urgentMaxDays * 24,
			hotLimit: numbers.hotLimit,
			demandDays: numbers.demandDays
		}
	}
}

const formatNumber = (value: number) =>
	new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value)

const formatHours = (hours: number) =>
	hours < 48 ? `${formatNumber(hours)} ч` : `${formatNumber(hours / 24)} дн`

// Наглядный пример: как порог срочности ложится на продукты с разным сроком хранения
const EXAMPLES = [
	{ name: 'курица на 2 суток', hours: 48 },
	{ name: 'молоко на 5 суток', hours: 120 },
	{ name: 'мука на год', hours: 365 * 24 }
]

function NumberField({
	field,
	unit,
	value,
	onChange,
	hint
}: {
	field: Field
	unit: string
	value: string
	onChange: (value: string) => void
	hint?: ReactNode
}) {
	const id = `settings-${field}`
	return (
		<div>
			<label
				htmlFor={id}
				className={catalogLabel}
			>
				{FIELDS[field].label}
			</label>
			<div className="mt-1.5 flex items-center gap-2">
				<input
					id={id}
					inputMode="numeric"
					autoComplete="off"
					className={twMerge(catalogInput, 'mt-0 w-24 font-mono')}
					value={value}
					onChange={e => onChange(e.target.value)}
					aria-describedby={hint ? `${id}-hint` : undefined}
				/>
				<span className="text-ink-muted">{unit}</span>
			</div>
			{hint && (
				<p
					id={`${id}-hint`}
					className="mt-2 text-caption text-ink-muted"
				>
					{hint}
				</p>
			)}
		</div>
	)
}

function SettingsForm({
	userId,
	saved
}: {
	userId: string
	saved: SavedSettings
}) {
	const client = useQueryClient()
	const [draft, setDraft] = useState<Draft>(() => toDraft(saved))
	const [error, setError] = useState('')
	const set = (field: Field) => (value: string) => {
		setDraft(current => ({ ...current, [field]: value }))
		setError('')
	}

	const save = useMutation({
		mutationFn: settingsApi.save,
		onSuccess(next) {
			client.setQueryData(settingsKeys.get(userId), next)
			setDraft(toDraft(next))
			toast.success('Настройки сохранены')
		},
		onError(saveError) {
			setError(managerError(saveError))
		}
	})

	const parsed = parse(draft)
	// Пока в форме ошибка, пример считается по сохранённым значениям
	const preview: RestaurantSettings =
		'value' in parsed
			? parsed.value
			: {
					cookReserveMinutes: saved.cookReserveMinutes,
					urgentPercent: saved.urgentPercent,
					urgentMinHours: saved.urgentMinHours,
					urgentMaxHours: saved.urgentMaxHours,
					hotLimit: saved.hotLimit,
					demandDays: saved.demandDays
				}

	const submit = (event: FormEvent) => {
		event.preventDefault()
		if ('error' in parsed) return setError(parsed.error)
		save.mutate(parsed.value)
	}

	return (
		<form
			onSubmit={submit}
			noValidate
		>
			<fieldset
				disabled={save.isPending}
				className="grid min-w-0 gap-5 lg:grid-cols-[3fr_2fr]"
			>
				<section
					className="rounded-lg border border-border bg-surface-raised p-5 sm:p-7"
					aria-labelledby="settings-expiry"
				>
					<h2 id="settings-expiry">
						Сроки <span className="title-accent">годности</span>
					</h2>
					<div className="mt-5 space-y-6">
						<NumberField
							field="cookReserveMinutes"
							unit="мин"
							value={draft.cookReserveMinutes}
							onChange={set('cookReserveMinutes')}
							hint="Если до конца срока партии осталось меньше, кухня из неё уже не готовит: партия не входит в «Можно: N» и не списывается по заказам. Такую партию целиком списывает менеджер."
						/>

						<div>
							<h3 className="font-semibold">Когда партия становится срочной</h3>
							<p className="mt-1 text-caption text-ink-muted">
								Когда до конца срока остаётся указанная доля срока хранения, но в
								пределах границ. Это порог для «Истекает» на складе и для
								горячих предложений.
							</p>
							<div className="mt-4 grid gap-4 sm:grid-cols-3">
								<NumberField
									field="urgentPercent"
									unit="%"
									value={draft.urgentPercent}
									onChange={set('urgentPercent')}
								/>
								<NumberField
									field="urgentMinHours"
									unit="ч"
									value={draft.urgentMinHours}
									onChange={set('urgentMinHours')}
								/>
								<NumberField
									field="urgentMaxDays"
									unit="дн"
									value={draft.urgentMaxDays}
									onChange={set('urgentMaxDays')}
								/>
							</div>
							<div className="mt-4 rounded-md bg-tint p-4 text-caption">
								<p className="font-semibold">Например, срочной партия станет:</p>
								<ul className="mt-2 space-y-1">
									{EXAMPLES.map(example => (
										<li key={example.name}>
											{example.name} — за{' '}
											<b className="font-mono">
												{formatHours(urgentWindowHours(example.hours, preview))}
											</b>{' '}
											до конца срока
										</li>
									))}
								</ul>
							</div>
						</div>
					</div>
				</section>

				<section
					className="self-start rounded-lg border border-border bg-surface-raised p-5 sm:p-7"
					aria-labelledby="settings-hot"
				>
					<h2 id="settings-hot">
						Горячие <span className="title-accent">предложения</span>
					</h2>
					<div className="mt-5">
						<NumberField
							field="hotLimit"
							unit="блюд"
							value={draft.hotLimit}
							onChange={set('hotLimit')}
							hint={
								<>
									Официант видит отметку{' '}
									<TbFlame
										className="inline align-[-2px] text-fire-ink"
										role="img"
										aria-label="горячее"
									/>{' '}
									у стольких блюд, которые лучше продать первыми. 0 — отметки
									выключены.
								</>
							}
						/>
						<div className="mt-6">
							<NumberField
								field="demandDays"
								unit="дн"
								value={draft.demandDays}
								onChange={set('demandDays')}
								hint="Сколько порций блюда заказали за этот период (вместе с отказами из-за нехватки). По этому темпу считаем, сколько успеют продать до конца срока: популярное блюдо спасает больше. Без истории считаем, что продадут все порции, которые можно приготовить."
							/>
						</div>
						<HotPreview
							userId={userId}
							settings={preview}
						/>
					</div>
				</section>
			</fieldset>

			{error && (
				<p
					role="alert"
					className="mt-5 rounded-md bg-danger-tint p-4 text-danger"
				>
					{error}
				</p>
			)}

			<div className="mt-6 flex flex-wrap items-center gap-3">
				<Button
					type="submit"
					disabled={save.isPending}
				>
					{save.isPending ? 'Сохраняем…' : 'Сохранить'}
				</Button>
				<Button
					variant="secondary"
					disabled={save.isPending}
					onClick={() => {
						setDraft(toDraft(DEFAULT_SETTINGS))
						setError('')
					}}
				>
					Значения по умолчанию
				</Button>
				{saved.updatedAt && (
					<span className="text-caption text-ink-muted">
						Изменено{' '}
						{new Date(saved.updatedAt).toLocaleString('ru-RU', {
							dateStyle: 'short',
							timeStyle: 'short'
						})}
					</span>
				)}
			</div>
		</form>
	)
}

function Workspace({ userId }: { userId: string }) {
	const query = useQuery({
		queryKey: settingsKeys.get(userId),
		queryFn: settingsApi.get,
		retry: false
	})

	return (
		<>
			<div className="mb-7">
				<p className="mb-3 text-caption font-bold tracking-[0.1em] uppercase text-gold-ink">
					Ресторан
				</p>
				<h1>Настройки</h1>
				<p className="mt-3 text-ink-muted">
					Правила сроков годности и горячих предложений. Действуют для всех
					сотрудников сразу после сохранения.
				</p>
			</div>
			{query.isPending ? (
				<Loading label="Загрузка настроек…" />
			) : query.isError ? (
				<div
					role="alert"
					className="rounded-md bg-danger-tint p-4 text-danger"
				>
					{managerError(query.error)}
				</div>
			) : (
				<SettingsForm
					key={query.data.updatedAt ?? 'default'}
					userId={userId}
					saved={query.data}
				/>
			)}
		</>
	)
}

export function SettingsWorkspace() {
	return (
		<ManagerAccess>{userId => <Workspace userId={userId} />}</ManagerAccess>
	)
}
