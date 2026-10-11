'use client'

import { Button } from '@/components/ui/Button'
import type { IMenuDish } from '@/types/waiter.types'
import { TbAdjustmentsMinus, TbMinus, TbPlus, TbSend } from 'react-icons/tb'
import { twMerge } from '@/utils/tw-merge'
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
			className="scroll-mt-24 rounded-lg bg-surface-raised p-6 shadow-popover sm:p-7"
		>
			<div className="mb-4 flex items-baseline justify-between gap-3">
				<h2 id="check-title">
					Ваш <span className="title-accent">чек</span>
				</h2>
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
				<ul className="mb-4 flex flex-col gap-2">
					{items.map(({ key, line, dish }) => {
						const adjustment = adjustments[key]
						const name = lineName(dish, line.excluded)
						return (
							<li
								key={key}
								className={twMerge(
									'rounded-md bg-surface py-3 pr-3 pl-4',
									adjustment && 'bg-tint'
								)}
							>
								<div className="flex items-center justify-between gap-3">
									<div className="flex min-w-0 flex-col">
										<span className="font-semibold">{dish.name}</span>
										{line.excluded.length > 0 && (
											<span className="text-caption font-semibold text-gold-ink">
												без: {excludedNames(dish, line.excluded).join(', ')}
											</span>
										)}
									</div>
									<div className="flex shrink-0 items-center gap-1">
										<Button
											variant="secondary"
											size="sm"
											className="size-9 min-h-9 border-transparent px-0"
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
											variant="secondary"
											size="sm"
											className="size-9 min-h-9 border-transparent px-0"
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
				блюда — кнопка{' '}
				<TbAdjustmentsMinus
					size={15}
					role="img"
					aria-label="с ползунками"
					className="inline align-[-3px]"
				/>{' '}
				в меню.
			</p>

			<div className="flex flex-col gap-2">
				<Button
					className="min-h-14 text-[17px]"
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
					className="min-h-12"
					onClick={onClear}
					disabled={(!items.length && !removed.length) || isSending}
				>
					Очистить чек
				</Button>
			</div>
		</section>
	)
}
