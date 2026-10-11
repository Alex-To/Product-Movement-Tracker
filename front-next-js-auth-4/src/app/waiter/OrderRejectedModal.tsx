'use client'

import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import type { IOrderRejection } from '@/types/waiter.types'
import { formatAmount, formatPortions } from './format'
import { dishCounts, type TCart } from './useCart'

interface Props {
	rejection: IOrderRejection | null
	cart: TCart
	onClose: () => void
	onLimit: () => void
}

const cellClass = 'px-3 py-2 align-top'

export function OrderRejectedModal({ rejection, cart, onClose, onLimit }: Props) {
	// Порции блюда по всем строкам чека, включая «без …»
	const counts = dishCounts(cart)
	const limited =
		rejection?.available.filter(
			item => counts[item.dishId] !== undefined && item.portions < counts[item.dishId]
		) ?? []

	return (
		<Modal
			isOpen={!!rejection}
			onClose={onClose}
			className="max-w-2xl"
		>
			{rejection && (
				<>
					<h2 className="mb-2 pr-8">{rejection.message}</h2>
					<p className="mb-5 text-ink-muted">
						Пока вы собирали чек, остатки изменились. Со склада ничего не
						списано.
					</p>

					{rejection.shortages.length > 0 && (
						<div className="mb-5 overflow-x-auto rounded-md border border-border">
							<table className="w-full min-w-[480px] border-collapse text-left">
								<thead className="text-caption font-semibold text-ink-muted">
									<tr className="border-b border-border">
										<th className={cellClass}>Продукт</th>
										<th className={cellClass}>Нужно</th>
										<th className={cellClass}>Есть годного</th>
										<th className={cellClass}>Блюдо</th>
									</tr>
								</thead>
								<tbody>
									{rejection.shortages.map(shortage => (
										<tr
											key={shortage.productName}
											className="border-t border-border first:border-t-0"
										>
											<td className={`${cellClass} font-semibold`}>
												{shortage.productName}
											</td>
											<td className={`${cellClass} font-mono text-caption`}>
												{formatAmount(shortage.need, shortage.unit)}
											</td>
											<td
												className={`${cellClass} font-mono text-caption text-danger`}
											>
												{formatAmount(shortage.available, shortage.unit)}
											</td>
											<td className={cellClass}>
												{shortage.dishes
													.map(dish => `${dish.name} × ${dish.count}`)
													.join(', ')}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}

					{rejection.stopped.length > 0 && (
						<p className="mb-5">
							В стоп-листе:{' '}
							<span className="font-semibold">
								{rejection.stopped.join(', ')}
							</span>
						</p>
					)}

					{limited.length > 0 && (
						<p className="mb-6">
							Сейчас можно:{' '}
							{limited.map((item, index) => (
								<span key={item.dishId}>
									{index > 0 && ', '}
									<span className="font-semibold">{item.name}</span> —{' '}
									{formatPortions(item.portions)}
								</span>
							))}
							. Чек сохранён, количество можно поправить.
						</p>
					)}

					<div className="flex flex-wrap gap-2">
						{limited.length > 0 && (
							<Button onClick={onLimit}>Уменьшить до доступного</Button>
						)}
						<Button
							variant={limited.length ? 'ghost' : 'primary'}
							onClick={onClose}
						>
							Вернуться к чеку
						</Button>
					</div>
				</>
			)}
		</Modal>
	)
}
