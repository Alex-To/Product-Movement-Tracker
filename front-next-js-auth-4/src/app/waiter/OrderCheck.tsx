'use client'

import { Button } from '@/components/ui/Button'
import type { IMenuDish } from '@/types/waiter.types'
import { TbMinus, TbPlus, TbSend } from 'react-icons/tb'
import { twMerge } from 'tailwind-merge'
import { formatPortions } from './format'
import {
	excludedNames,
	lineName,
	type ICartAdjustment,
	type TCart
} from './useCart'

interface Props {
	menu: IMenuDish[]
	cart: TCart
	adjustments: Record<string, ICartAdjustment>
	totalPortions: number
	isSending: boolean
	canAdd: (dish: IMenuDish, excluded: string[]) => boolean
	onAdd: (dish: IMenuDish, excluded: string[]) => void
	onRemove: (key: string) => void
	onClear: () => void
	onSend: () => void
}

export function OrderCheck({
	menu,
	cart,
	adjustments,
	totalPortions,
	isSending,
	canAdd,
	onAdd,
	onRemove,
	onClear,
	onSend
}: Props) {
	// В порядке меню; строки одного блюда («без …») идут рядом
	const items = menu.flatMap(dish =>
		Object.entries(cart)
			.filter(([, line]) => line.dishId === dish.id)
			.map(([key, line]) => ({ key, line, dish }))
	)
	const removed = Object.entries(adjustments).filter(([, a]) => a.to === 0)

	return (
		<section
			id="check"
			aria-labelledby="check-title"
			className="scroll-mt-24 rounded-lg border border-border bg-surface-raised p-5 shadow-card"
		>
			<div className="mb-4 flex items-baseline justify-between gap-3">
				<h2 id="check-title">Чек</h2>
				{totalPortions > 0 && (
					<span className="font-mono text-caption text-ink-muted">
						{formatPortions(totalPortions)}
					</span>
				)}
			</div>

			{items.length === 0 && removed.length === 0 && (
				<p className="mb-4 text-ink-muted">
					Пусто. Добавьте блюда кнопкой «+» в меню.
				</p>
			)}

			{items.length > 0 && (
				<ul className="mb-4 flex flex-col gap-1">
					{items.map(({ key, line, dish }) => {
						const adjustment = adjustments[key]
						const name = lineName(dish, line.excluded)
						return (
							<li
								key={key}
								className={twMerge(
									'rounded-sm px-2 py-2',
									adjustment && 'bg-tint'
								)}
							>
								<div className="flex items-center justify-between gap-3">
									<div className="flex min-w-0 flex-col">
										<span className="font-semibold">{dish.name}</span>
										{line.excluded.length > 0 && (
											<span className="text-caption text-fire-ink">
												без: {excludedNames(dish, line.excluded).join(', ')}
											</span>
										)}
									</div>
									<div className="flex shrink-0 items-center gap-1">
										<Button
											variant="ghost"
											size="sm"
											className="w-9 px-0"
											onClick={() => onRemove(key)}
											aria-label={`Убрать порцию: ${name}`}
										>
											<TbMinus
												size={16}
												aria-hidden
											/>
										</Button>
										<span
											className="min-w-6 text-center font-mono font-semibold"
											aria-live="polite"
										>
											{line.count}
										</span>
										<Button
											variant="ghost"
											size="sm"
											className="w-9 px-0"
											onClick={() => onAdd(dish, line.excluded)}
											disabled={!canAdd(dish, line.excluded)}
											aria-label={`Добавить порцию: ${name}`}
										>
											<TbPlus
												size={16}
												aria-hidden
											/>
										</Button>
									</div>
								</div>
								{adjustment && (
									<p className="text-caption text-ink-muted">
										{adjustment.reason === 'shared'
											? 'Продукты делятся с другими блюдами чека'
											: 'Остатки изменились'}
										: было {adjustment.from}, теперь можно {adjustment.to}
									</p>
								)}
							</li>
						)
					})}
				</ul>
			)}

			{removed.length > 0 && (
				<ul className="mb-4 flex flex-col gap-1">
					{removed.map(([key, adjustment]) => (
						<li
							key={key}
							className="rounded-sm bg-tint px-2 py-2 text-caption"
						>
							<span className="font-semibold">{adjustment.name}</span> убрано из
							чека:{' '}
							{adjustment.reason === 'shared'
								? 'его продукты заняты другими блюдами в чеке'
								: 'порций не осталось'}
						</li>
					))}
				</ul>
			)}

			<p className="mb-4 text-caption text-ink-muted">
				Количество меняется кнопками −/+ здесь или в меню. Убрать продукт из
				блюда — кнопка «Без…» в меню.
			</p>

			<div className="flex flex-wrap gap-2">
				<Button
					className="flex-1"
					onClick={onSend}
					disabled={!items.length || isSending}
				>
					<TbSend
						size={20}
						aria-hidden
					/>
					{isSending ? 'Отправляем…' : 'Отправить заказ'}
				</Button>
				<Button
					variant="secondary"
					onClick={onClear}
					disabled={(!items.length && !removed.length) || isSending}
				>
					Очистить чек
				</Button>
			</div>
		</section>
	)
}
