'use client'

import { errorCatch } from '@/api/api.helper'
import kitchenService from '@/services/kitchen.service'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import toast from 'react-hot-toast'
import { formatAmount, formatDateTime, isExpired } from '../format'

export function WriteOffForm() {
	const queryClient = useQueryClient()

	const [productId, setProductId] = useState('')
	const [batchId, setBatchId] = useState('')
	const [count, setCount] = useState('')

	const { data, isLoading } = useQuery({
		queryKey: ['kitchen', 'products'],
		queryFn: () => kitchenService.fetchProducts()
	})

	const products = data?.data ?? []
	const product = products.find(p => p.id === productId)
	const batch = product?.batches.find(b => b.id === batchId)

	const { mutate: writeOff, isPending } = useMutation({
		mutationKey: ['kitchen', 'write-off'],
		mutationFn: () => kitchenService.writeOff({ batchId, count }),
		onSuccess() {
			toast.success(
				`Списано: ${product?.nameProduct}, ${formatAmount(count.replace(',', '.'), product?.unit.name)}`
			)
			setCount('')
			setBatchId('')
			queryClient.invalidateQueries({ queryKey: ['kitchen'] })
		},
		onError(error) {
			toast.error(errorCatch(error))
		}
	})

	const onProductChange = (id: string) => {
		setProductId(id)
		setBatchId('')
		setCount('')
	}

	const onSubmit = (e: FormEvent) => {
		e.preventDefault()

		if (!batch) return toast.error('Выберите партию')

		const amount = Number(count.replace(',', '.'))
		if (!amount || amount <= 0) return toast.error('Введите количество больше нуля')
		if (amount > Number(batch.count))
			return toast.error(
				`Нельзя списать больше остатка: ${formatAmount(batch.count, product?.unit.name)}`
			)

		writeOff()
	}

	return (
		<form
			onSubmit={onSubmit}
			className="flex flex-col gap-4"
		>
			<h1>Ручное списание</h1>

			<label className="flex flex-col gap-1 max-w-sm">
				1. Продукт
				<select
					id="write-off-product"
					value={productId}
					onChange={e => onProductChange(e.target.value)}
					className="border border-zinc-600 rounded p-2 bg-transparent"
					disabled={isLoading}
				>
					<option value="">— выберите продукт —</option>
					{products.map(p => (
						<option
							key={p.id}
							value={p.id}
							disabled={!p.batches.length}
						>
							{p.nameProduct} ({p.unit.name})
							{!p.batches.length && ' — нет на складе'}
						</option>
					))}
				</select>
			</label>

			{product && (
				<fieldset className="flex flex-col gap-2">
					<legend className="mb-2">2. Партия (сначала с ранним сроком)</legend>
					{product.batches.map(b => (
						<label
							key={b.id}
							className="flex items-center gap-3 border border-zinc-700 rounded p-2"
						>
							<input
								type="radio"
								name="write-off-batch"
								value={b.id}
								checked={batchId === b.id}
								onChange={() => setBatchId(b.id)}
							/>
							<span>
								{b.delivery.number} · остаток {formatAmount(b.count, product.unit.name)} · годен
								до {formatDateTime(b.EXP)}
								{isExpired(b.EXP) && <b> · просрочено</b>}
							</span>
						</label>
					))}
				</fieldset>
			)}

			{batch && (
				<div className="flex flex-wrap items-end gap-3">
					<label className="flex flex-col gap-1">
						3. Количество, {product?.unit.name}
						<input
							id="write-off-count"
							type="text"
							inputMode="decimal"
							value={count}
							onChange={e => setCount(e.target.value)}
							className="border border-zinc-600 rounded p-2 bg-transparent w-40"
							placeholder="0,5"
						/>
					</label>
					<button
						type="button"
						onClick={() => setCount(batch.count)}
						className="border border-zinc-600 rounded px-3 py-2"
					>
						Весь остаток партии
					</button>
					<button
						type="submit"
						disabled={isPending}
						className="bg-primary rounded px-4 py-2"
					>
						{isPending ? 'Списываем…' : 'Списать'}
					</button>
				</div>
			)}
		</form>
	)
}
