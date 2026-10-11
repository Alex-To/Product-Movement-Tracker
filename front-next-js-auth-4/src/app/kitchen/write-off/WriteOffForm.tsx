'use client'

import { errorCatch } from '@/api/api.helper'
import { Button } from '@/components/ui/Button'
import kitchenService from '@/services/kitchen.service'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import toast from 'react-hot-toast'
import { twMerge } from '@/utils/tw-merge'
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
			className="flex flex-col gap-6"
		>
			<h1>
				Ручное <span className="title-accent">списание</span>
			</h1>

			<div className="flex max-w-3xl flex-col gap-6 rounded-lg bg-surface-raised p-5 shadow-card sm:p-8">
				<label className="flex max-w-md flex-col gap-2 font-semibold">
					<span>
						<span className="text-gold-ink">1.</span> Продукт
					</span>
					<select
						id="write-off-product"
						value={productId}
						onChange={e => onProductChange(e.target.value)}
						className="min-h-13 rounded-md bg-tint px-4 font-normal text-ink"
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
						<legend className="mb-2 font-semibold">
							<span className="text-gold-ink">2.</span> Партия (сначала с ранним сроком)
						</legend>
						{product.batches.map(b => (
							<label
								key={b.id}
								className={twMerge(
									'flex min-h-14 cursor-pointer items-center gap-3 rounded-md border-2 bg-surface px-4 py-3',
									batchId === b.id ? 'border-accent' : 'border-transparent'
								)}
							>
								<input
									type="radio"
									name="write-off-batch"
									value={b.id}
									checked={batchId === b.id}
									onChange={() => setBatchId(b.id)}
									className="size-5 shrink-0 accent-gold"
								/>
								<span>
									<b>{b.delivery.number}</b> · остаток{' '}
									{formatAmount(b.count, product.unit.name)} · годен до{' '}
									{formatDateTime(b.EXP)}
									{isExpired(b.EXP) && (
										<b className="text-danger"> · просрочено</b>
									)}
								</span>
							</label>
						))}
					</fieldset>
				)}

				{batch && (
					<div className="flex flex-wrap items-end gap-3">
						<label className="flex flex-col gap-2 font-semibold">
							<span>
								<span className="text-gold-ink">3.</span> Количество, {product?.unit.name}
							</span>
							<input
								id="write-off-count"
								type="text"
								inputMode="decimal"
								value={count}
								onChange={e => setCount(e.target.value)}
								className="min-h-13 w-40 rounded-md bg-tint px-4 font-normal text-ink placeholder:text-ink-muted"
								placeholder="0,5"
							/>
						</label>
						<Button
							variant="secondary"
							className="min-h-13"
							onClick={() => setCount(batch.count)}
						>
							Весь остаток партии
						</Button>
						<Button
							type="submit"
							className="min-h-13 px-8"
							disabled={isPending}
						>
							{isPending ? 'Списываем…' : 'Списать'}
						</Button>
					</div>
				)}
			</div>
		</form>
	)
}
