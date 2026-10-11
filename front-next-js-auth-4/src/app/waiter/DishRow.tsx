'use client'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DishImage } from '@/components/ui/DishImage'
import type { IMenuDish } from '@/types/waiter.types'
import {
	TbAdjustmentsMinus,
	TbBan,
	TbFlame,
	TbMinus,
	TbPlus
} from 'react-icons/tb'
import { twMerge } from 'tailwind-merge'
import { formatPortions } from './format'

interface Props {
	dish: IMenuDish
	// Обычные порции; порции «без …» меняются в чеке
	count: number
	// Все порции блюда в чеке, включая «без …»
	total: number
	// Хватит ли продуктов ещё на порцию с учётом всего чека
	canAdd: boolean
	onAdd: () => void
	onRemove: () => void
	onExclude: () => void
}


export function DishRow({
	dish,
	count,
	total,
	canAdd,
	onAdd,
	onRemove,
	onExclude
}: Props) {
	const isMax = !canAdd && total > 0 && total >= dish.portions
	const modified = total - count
	// Порции блюда ещё есть, но общие продукты уже заняты другими блюдами чека
	const isShared = !isMax && !canAdd
	// Официанту не показываем ни сроки годности, ни причину стоп-листа
	const reason = dish.isStopped ? null : (dish.expiring?.productName ?? null)

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
			<DishImage
				image={dish.image}
				alt={dish.name}
				muted={dish.isStopped}
				className="size-16 sm:size-24"
			/>
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
							disabled={!canAdd}
							aria-label={`Добавить порцию: ${dish.name}`}
						>
							<TbPlus
								size={20}
								aria-hidden
							/>
						</Button>
					</div>
					{/* Из блюда с одним продуктом убирать нечего */}
					{dish.ingredients.length > 1 && (
						<Button
							variant="ghost"
							size="sm"
							onClick={onExclude}
							aria-label={`Без продукта: ${dish.name}`}
						>
							<TbAdjustmentsMinus
								size={18}
								aria-hidden
							/>
							Без…
						</Button>
					)}
					{modified > 0 && (
						<span className="text-caption text-ink-muted">
							Ещё {formatPortions(modified)} без продуктов — в чеке
						</span>
					)}
					{isMax && (
						<span className="text-caption text-ink-muted">
							Максимум: больше {dish.portions} добавить нельзя
						</span>
					)}
					{isShared && (
						<span className="text-caption text-ink-muted">
							Продукты уже заняты другими блюдами в чеке
						</span>
					)}
				</div>
			)}
		</li>
	)
}
