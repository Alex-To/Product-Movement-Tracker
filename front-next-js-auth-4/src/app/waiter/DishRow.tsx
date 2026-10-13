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
import { twMerge } from '@/utils/tw-merge'
import { formatPortions } from './format'

interface Props {
	dish: IMenuDish
	// Обычные порции; порции «без …» меняются в чеке
	count: number
	// Все порции блюда в чеке, включая «без …»
	total: number
	// Хватит ли продуктов ещё на порцию с учётом всего чека
	canAdd: boolean
	// Сколько ещё порций поместится с учётом уже набранного чека
	left: number
	onAdd: () => void
	onRemove: () => void
	onExclude: () => void
}


export function DishRow({
	dish,
	count,
	total,
	canAdd,
	left,
	onAdd,
	onRemove,
	onExclude
}: Props) {
	const isMax = !canAdd && total > 0 && total >= dish.portions
	const modified = total - count
	// Порции блюда ещё есть, но общие продукты уже заняты другими блюдами чека
	const isShared = !isMax && !canAdd

	// Круглые кнопки внутри группы порций
	const roundButton = twMerge(
		'inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors',
		'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
		'disabled:cursor-not-allowed disabled:opacity-40',
		dish.isHot ? 'bg-tint text-ink hover:bg-border' : 'bg-surface-raised text-ink hover:bg-tint'
	)

	return (
		<li
			className={twMerge(
				'flex flex-wrap items-center gap-x-5 gap-y-3 rounded-lg p-4',
				dish.isHot
					? 'border-2 border-fire bg-fire-tint'
					: dish.isStopped
						? 'border-[1.5px] border-dashed border-stop-border bg-stop-tint'
						: 'border border-border bg-surface-raised'
			)}
		>
			<DishImage
				image={dish.image}
				alt={dish.name}
				muted={dish.isStopped}
				className="size-18 sm:size-24"
			/>
			<div className="flex min-w-0 flex-[1_1_200px] flex-col gap-1">
				<span
					className={twMerge(
						'inline-flex flex-wrap items-center gap-2 text-[17px] font-bold sm:text-[19px]',
						dish.isStopped && 'text-ink-muted'
					)}
				>
					{dish.isHot && (
						<TbFlame
							size={20}
							className="shrink-0 text-fire-ink"
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
				{!dish.isStopped && (
					<span className="font-mono text-caption text-ink-muted">
						Можно: {formatPortions(left)}
					</span>
				)}
			</div>

			{dish.isStopped ? (
				<Button
					disabled
					// Карточка стоп-листа уже цвета stop-tint — кнопка поверх неё светлее
					className="ml-auto disabled:bg-surface-raised"
				>
					Нельзя добавить
				</Button>
			) : (
				<div className="ml-auto flex flex-col items-end gap-2">
					<div
						role="group"
						aria-label={`Порции: ${dish.name}`}
						className={twMerge(
							'flex items-center gap-1.5 rounded-full p-1',
							dish.isHot ? 'bg-surface-raised' : 'bg-surface'
						)}
					>
						{/* Из блюда с одним продуктом убирать нечего */}
						{dish.ingredients.length > 1 && (
							<>
								<button
									type="button"
									className={roundButton}
									onClick={onExclude}
									aria-label={`Без продукта: ${dish.name}`}
									title="Убрать продукт из блюда"
								>
									<TbAdjustmentsMinus
										size={19}
										aria-hidden
									/>
								</button>
								<span
									aria-hidden
									className="h-6 w-px bg-border-strong"
								/>
							</>
						)}
						<button
							type="button"
							className={roundButton}
							onClick={onRemove}
							disabled={count === 0}
							aria-label={`Убрать порцию: ${dish.name}`}
						>
							<TbMinus
								size={18}
								aria-hidden
							/>
						</button>
						<span
							className="min-w-7 text-center font-mono font-bold"
							aria-live="polite"
						>
							{count}
						</span>
						<button
							type="button"
							className={twMerge(roundButton, 'bg-accent text-on-accent hover:bg-accent-hover')}
							onClick={onAdd}
							disabled={!canAdd}
							aria-label={`Добавить порцию: ${dish.name}`}
						>
							<TbPlus
								size={18}
								aria-hidden
							/>
						</button>
					</div>
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
