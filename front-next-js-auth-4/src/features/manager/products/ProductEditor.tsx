'use client'

import { Button } from '@/components/ui/Button'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { TbInfoCircle, TbPlus } from 'react-icons/tb'
import toast from 'react-hot-toast'
import { managerApi, managerError } from '../api/manager.api'
import { managerKeys } from '../api/manager.keys'
import type { ManagerProduct, ManagerUnit } from '../api/manager.types'
import { catalogInput, catalogLabel } from './styles'
import { UnitManager } from './UnitManager'

export function ProductEditor({ product, units, userId, onDone }: { product: ManagerProduct | null; units: ManagerUnit[]; userId: string; onDone: () => void }) {
	const client = useQueryClient()
	const [name, setName] = useState(product?.name ?? '')
	const [unitId, setUnitId] = useState(product?.unit.id ?? '')
	const [error, setError] = useState('')
	const [checkedName, setCheckedName] = useState('')
	useEffect(() => {
		const timer = setTimeout(() => setCheckedName(name.trim().replace(/\s+/g, ' ')), 300)
		return () => clearTimeout(timer)
	}, [name])
	const duplicate = useQuery({
		queryKey: managerKeys.name(userId, checkedName, product?.id),
		queryFn: () => managerApi.checkName(checkedName, product?.id),
		enabled: !!checkedName,
		retry: false
	})
	const save = useMutation({
		mutationFn: () => managerApi.saveProduct({ name: name.trim().replace(/\s+/g, ' '), unitId }, product?.id),
		async onSuccess(result) {
			await client.invalidateQueries({ queryKey: managerKeys.catalog })
			toast.success(product ? 'Продукт изменён' : 'Продукт добавлен')
			result.warnings.forEach(warning => toast(warning, { duration: 6000 }))
			setName(''); setUnitId(''); setError(''); onDone()
		},
		onError: e => setError(managerError(e))
	})
	const submit = (e: FormEvent) => {
		e.preventDefault(); setError('')
		if (!name.trim()) return setError('Введите название продукта')
		if (!unitId || !units.some(unit => unit.id === unitId)) return setError('Выберите существующую единицу')
		save.mutate()
	}
	const unitLocked = !!product && !product.canChangeUnit
	return (
		<aside id="product-editor" className="rounded-lg border border-border bg-surface-raised p-5 shadow-card sm:p-6 lg:sticky lg:top-6">
			<div className="mb-5 flex items-center gap-2"><span className="flex size-9 items-center justify-center rounded-md bg-tint text-accent"><TbPlus size={21} aria-hidden /></span><h2 className="!text-title">{product ? 'Изменить продукт' : 'Новый продукт'}</h2></div>
			<form onSubmit={submit} className="space-y-5">
				<div><label className={catalogLabel} htmlFor="manager-product-name">Название продукта</label><input id="manager-product-name" className={catalogInput} value={name} onChange={e => setName(e.target.value)} placeholder="Например, сливки 33%" maxLength={150} required disabled={save.isPending} />
					{!!duplicate.data?.matches && <p role="status" className="mt-2 rounded-sm bg-tint p-3 text-caption text-ink"><b>Такое название уже есть.</b> Можно сохранить ещё один продукт. Проверьте, что он действительно нужен.</p>}
				</div>
				<div><label className={catalogLabel} htmlFor="manager-product-unit">Единица измерения</label><select id="manager-product-unit" className={catalogInput} value={unitId} onChange={e => setUnitId(e.target.value)} disabled={unitLocked || save.isPending || units.length === 0} required>
					<option value="">{units.length ? 'Выберите единицу' : 'Сначала добавьте единицу ниже'}</option>{units.map(unit => <option value={unit.id} key={unit.id}>{unit.name}</option>)}
				</select>{unitLocked && <p className="mt-2 text-caption text-ink-muted">Единица закреплена: у продукта есть партии или он используется в рецептах.</p>}</div>
				<div className="flex gap-2 rounded-md bg-surface p-3 text-caption text-ink-muted"><TbInfoCircle size={19} className="mt-0.5 shrink-0" aria-hidden /><p>Здесь создаётся продукт. Количество и срок годности указываются при приёме поставки.</p></div>
				{error && <p role="alert" className="rounded-sm bg-danger-tint p-3 text-caption text-danger">{error}</p>}
				<div className="flex flex-wrap gap-2"><Button type="submit" disabled={save.isPending || !units.length}>{save.isPending ? 'Сохраняем…' : product ? 'Сохранить изменения' : 'Добавить продукт'}</Button>{product && <Button variant="ghost" onClick={onDone} disabled={save.isPending}>Отмена</Button>}</div>
			</form>
			<UnitManager units={units} onCreated={id => { if (!unitLocked) setUnitId(id) }} />
		</aside>
	)
}
