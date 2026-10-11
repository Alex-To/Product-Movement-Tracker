'use client'

import { Button } from '@/components/ui/Button'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { TbPlus, TbRulerMeasure, TbX } from 'react-icons/tb'
import toast from 'react-hot-toast'
import { managerApi, managerError } from '../api/manager.api'
import { managerKeys } from '../api/manager.keys'
import type { ManagerUnit } from '../api/manager.types'
import { catalogInput, catalogLabel } from './styles'

export function UnitManager({ units, onCreated }: { units: ManagerUnit[]; onCreated: (id: string) => void }) {
	const client = useQueryClient()
	const [name, setName] = useState('')
	const [error, setError] = useState('')
	const [deleteId, setDeleteId] = useState<string | null>(null)
	const create = useMutation({
		mutationFn: managerApi.createUnit,
		async onSuccess(unit) {
			await client.invalidateQueries({ queryKey: managerKeys.catalog })
			setName(''); setError(''); onCreated(unit.id); toast.success('Единица добавлена')
		},
		onError: e => setError(managerError(e))
	})
	const remove = useMutation({
		mutationFn: managerApi.deleteUnit,
		async onSuccess() {
			setDeleteId(null); setError('')
			await client.invalidateQueries({ queryKey: managerKeys.catalog })
			toast.success('Единица удалена')
		},
		onError: e => setError(managerError(e))
	})
	const onSubmit = (e: FormEvent) => {
		e.preventDefault(); setError('')
		const value = name.trim().replace(/\s+/g, ' ')
		if (!value) return setError('Введите название единицы')
		create.mutate(value)
	}
	const deleting = units.find(unit => unit.id === deleteId)
	return (
		<details className="mt-6 border-t border-border pt-5" open={units.length === 0 ? true : undefined}>
			<summary className="flex cursor-pointer items-center gap-2 text-caption font-semibold text-accent"><TbRulerMeasure size={19} aria-hidden /> Единицы измерения <span className="ml-auto text-ink-muted">{units.length}</span></summary>
			<p className="mt-3 text-caption text-ink-muted">Например: кг, л, шт. Добавьте нужную единицу и выберите её для продукта.</p>
			<div className="my-3 flex flex-wrap gap-2">
				{units.map(unit => <span key={unit.id} className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface px-2 py-1 text-caption">
					{unit.name}
					{unit.canDelete && <button type="button" aria-label={`Удалить единицу ${unit.name}`} title="Удалить неиспользуемую единицу" disabled={remove.isPending} onClick={() => setDeleteId(unit.id)} className="rounded p-1 text-ink-muted hover:bg-tint hover:text-danger disabled:opacity-50"><TbX size={14} aria-hidden /></button>}
				</span>)}
			</div>
			{deleting && <div className="mb-3 rounded-sm border border-border bg-surface p-3 text-caption">
				<p>Удалить единицу «{deleting.name}»?</p>
				<div className="mt-2 flex gap-2"><Button size="sm" variant="secondary" disabled={remove.isPending} onClick={() => remove.mutate(deleting.id)}>Удалить</Button><Button size="sm" variant="ghost" disabled={remove.isPending} onClick={() => setDeleteId(null)}>Отмена</Button></div>
			</div>}
			<form onSubmit={onSubmit}>
				<label className={catalogLabel} htmlFor="manager-unit-name">Новая единица</label>
				<div className="flex items-end gap-2"><input id="manager-unit-name" className={catalogInput} value={name} onChange={e => setName(e.target.value)} maxLength={30} placeholder="Например, кг" required disabled={create.isPending} /><Button type="submit" aria-label="Добавить единицу" disabled={create.isPending}><TbPlus size={20} aria-hidden /></Button></div>
			</form>
			{error && <p role="alert" className="mt-3 text-caption text-danger">{error}</p>}
		</details>
	)
}
