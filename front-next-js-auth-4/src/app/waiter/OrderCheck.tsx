'use client'

import { Button } from '@/components/ui/Button'
import type { IMenuDish } from '@/types/waiter.types'
import { TbSend } from 'react-icons/tb'
import { twMerge } from 'tailwind-merge'
import { formatPortions } from './format'
import type { ICartAdjustment, TCart } from './useCart'

interface Props {
	menu: IMenuDish[]
	cart: TCart
	adjustments: Record<string, ICartAdjustment>
	totalPortions: number
	isSending: boolean
	onClear: () => void
	onSend: () => void
}

export function OrderCheck({
	menu,
	cart,
	adjustments,
	totalPortions,
	isSending,
	onClear,
	onSend
}: Props) {
	const items = menu.filter(dish => cart[dish.id])
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
					{items.map(dish => {
						const adjustment = adjustments[dish.id]
						return (
							<li
								key={dish.id}
								className={twMerge(
									'rounded-sm px-2 py-2',
									adjustment && 'bg-tint'
								)}
							>
								<div className="flex items-baseline justify-between gap-3">
									<span className="font-semibold">{dish.name}</span>
									<span className="font-mono font-semibold">
										× {cart[dish.id]}
									</span>
								</div>
								{adjustment && (
									<p className="text-caption text-ink-muted">
										Остатки изменились: было {adjustment.from}, теперь можно{' '}
										{adjustment.to}
									</p>
								)}
							</li>
						)
					})}
				</ul>
			)}

			{removed.length > 0 && (
				<ul className="mb-4 flex flex-col gap-1">
					{removed.map(([dishId, adjustment]) => (
						<li
							key={dishId}
							className="rounded-sm bg-tint px-2 py-2 text-caption"
						>
							<span className="font-semibold">{adjustment.name}</span> убрано из
							чека: порций не осталось
						</li>
					))}
				</ul>
			)}

			<p className="mb-4 text-caption text-ink-muted">
				Количество меняется кнопками −/+ в меню.
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
