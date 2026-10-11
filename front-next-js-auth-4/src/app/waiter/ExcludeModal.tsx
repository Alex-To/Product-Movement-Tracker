'use client'

import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import type { IMenuDish } from '@/types/waiter.types'
import { useEffect, useState } from 'react'
import { TbPlus } from 'react-icons/tb'

interface Props {
	dish: IMenuDish | null
	canAdd: (dish: IMenuDish, excluded: string[]) => boolean
	onAdd: (dish: IMenuDish, excluded: string[]) => void
	onClose: () => void
}

// Гость просит убрать продукт из блюда: отмечаем, чего не класть.
// Убранное не списывается со склада, кухня видит пометку «без …»
export function ExcludeModal({ dish, canAdd, onAdd, onClose }: Props) {
	const [excluded, setExcluded] = useState<string[]>([])

	// Каждое блюдо открываем с чистого листа
	useEffect(() => setExcluded([]), [dish?.id])

	const toggle = (productId: string) =>
		setExcluded(prev =>
			prev.includes(productId)
				? prev.filter(id => id !== productId)
				: [...prev, productId]
		)

	const total = dish?.ingredients.length ?? 0
	// Хотя бы один продукт должен остаться
	const isLastLeft = excluded.length === total - 1
	const isAllowed = !!dish && excluded.length > 0 && canAdd(dish, excluded)

	return (
		<Modal
			isOpen={!!dish}
			onClose={onClose}
		>
			{dish && (
				<>
					<h2 className="mb-1 pr-8">Без чего приготовить?</h2>
					<p className="mb-5 text-ink-muted">
						{dish.name}. Отметьте, что убрать, — кухня увидит это в заказе,
						а со склада убранное не спишется.
					</p>

					<fieldset className="mb-4 flex flex-col gap-1">
						<legend className="sr-only">Что убрать из блюда</legend>
						{dish.ingredients.map(item => {
							const checked = excluded.includes(item.productId)
							return (
								<label
									key={item.productId}
									className="flex min-h-11 cursor-pointer items-center gap-3 rounded-sm px-2 hover:bg-tint has-disabled:cursor-not-allowed has-disabled:opacity-60"
								>
									<input
										type="checkbox"
										checked={checked}
										disabled={!checked && isLastLeft}
										onChange={() => toggle(item.productId)}
										className="size-5 accent-accent"
									/>
									<span className={checked ? 'line-through text-ink-muted' : ''}>
										{item.name}
									</span>
								</label>
							)
						})}
					</fieldset>

					{isLastLeft && (
						<p className="mb-4 text-caption text-ink-muted">
							Хотя бы один продукт должен остаться в блюде.
						</p>
					)}
					{excluded.length > 0 && !isAllowed && (
						<p className="mb-4 text-caption text-danger">
							Продуктов на эту порцию не хватает — они заняты другими блюдами в
							чеке.
						</p>
					)}

					<div className="flex flex-wrap gap-2">
						<Button
							className="flex-1"
							disabled={!isAllowed}
							onClick={() => onAdd(dish, excluded)}
						>
							<TbPlus
								size={20}
								aria-hidden
							/>
							Добавить в чек
						</Button>
						<Button
							variant="ghost"
							onClick={onClose}
						>
							Отмена
						</Button>
					</div>
				</>
			)}
		</Modal>
	)
}
