'use client'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import type { IMenuDish } from '@/types/waiter.types'
import { TbBan, TbFlame, TbMinus, TbPlus } from 'react-icons/tb'
import { twMerge } from 'tailwind-merge'
import { formatExpiry, formatPortions } from './format'

interface Props {
	dish: IMenuDish
	count: number
	onAdd: () => void
	onRemove: () => void
}

const stopReason = (dish: IMenuDish) => {
	if (!dish.hasRecipe) return 'Состав блюда не задан'
	if (dish.missing.length) return `Нет продукта: ${dish.missing.join(', ')}`
	if (dish.stops.includes('MANUAL')) return 'Поставлено в стоп-лист кухней'
	return 'Нет продуктов на порцию'
}

const priorityReason = (dish: IMenuDish) => {
	if (!dish.expiring) return null
	const { productName, expiresAt } = dish.expiring
	return `${productName}: ${dish.isHot ? 'партия ' : ''}${formatExpiry(expiresAt)}`
}

export function DishRow({ dish, count, onAdd, onRemove }: Props) {
	const isMax = count > 0 && count >= dish.portions
	const reason = dish.isStopped ? stopReason(dish) : priorityReason(dish)

	return (
		<li
			className={twMerge(
				'flex flex-wrap items-center gap-x-4 gap-y-3 rounded-md border px-4 py-3',
				dish.isHot
					? 'border-2 border-fire bg-fire-tint'
					: dish.isStopped
						? 'border-dashed border-stop-border bg-surface'
						: 'border-border bg-surface-raised shadow-card'
			)}
		>
			<div className="flex min-w-0 flex-[1_1_220px] flex-col gap-0.5">
				<span
					className={twMerge(
						'inline-flex flex-wrap items-center gap-2 text-title font-semibold',
						dish.isStopped && 'text-ink-muted'
					)}
				>
					{dish.isHot && (
						<TbFlame
							size={20}
							className="shrink-0 text-fire"
							role="img"
							aria-label="Горячее предложение"
						/>
					)}
					{dish.name}
					{dish.isStopped && (
						<Badge
							variant="stop"
							icon={<TbBan aria-hidden />}
						>
							Стоп-лист
						</Badge>
					)}
				</span>
				{reason && (
					<span
						className={twMerge(
							'text-caption',
							dish.isHot ? 'text-fire-ink' : 'text-ink-muted'
						)}
					>
						{reason}
					</span>
				)}
				{!dish.isStopped && (
					<span className="font-mono text-caption text-ink-muted">
						Можно: {formatPortions(dish.portions)}
					</span>
				)}
			</div>

			{dish.isStopped ? (
				<Button
					disabled
					className="ml-auto"
				>
					Нельзя добавить
				</Button>
			) : (
				<div className="ml-auto flex flex-col items-end gap-1">
					<div className="flex items-center gap-2">
						<Button
							variant="secondary"
							className="w-11 px-0"
							onClick={onRemove}
							disabled={count === 0}
							aria-label={`Убрать порцию: ${dish.name}`}
						>
							<TbMinus
								size={20}
								aria-hidden
							/>
						</Button>
						<span
							className="min-w-8 text-center font-mono text-body font-semibold"
							aria-live="polite"
						>
							{count}
						</span>
						<Button
							variant="secondary"
							className="w-11 px-0"
							onClick={onAdd}
							disabled={isMax}
							aria-label={`Добавить порцию: ${dish.name}`}
						>
							<TbPlus
								size={20}
								aria-hidden
							/>
						</Button>
					</div>
					{isMax && (
						<span className="text-caption text-ink-muted">
							Максимум: больше {dish.portions} добавить нельзя
						</span>
					)}
				</div>
			)}
		</li>
	)
}
