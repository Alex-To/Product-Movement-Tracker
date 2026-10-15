'use client'
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Loading } from '@/components/ui/PizzaLoader'
import { managerError } from '../api/manager.api'
import { catalogInput, catalogLabel } from '../products/styles'
import { receiptDate } from '../deliveries/deliveries.api'
import { MANAGER_ROUTES } from '../config/manager.routes'
import { externalApi, requestStatus, type Decision } from './external.api'

export function RequestReview({
	userId,
	id,
	onClose
}: {
	userId: string
	id: string
	onClose: () => void
}) {
	const client = useQueryClient(),
		key = ['manager', 'external-interfaces', userId]
	const query = useQuery({
		queryKey: [...key, 'detail', id],
		queryFn: () => externalApi.request(id),
		retry: false
	})
	const [amounts, setAmounts] = useState<Record<string, string>>({}),
		[included, setIncluded] = useState<Record<string, boolean>>({}),
		[receivedAt, setReceivedAt] = useState(''),
		[comment, setComment] = useState(''),
		[confirm, setConfirm] = useState<'accept' | 'reject' | null>(null),
		[error, setError] = useState('')
	// Initialize once: background changes must not overwrite a manager's draft.
	const [initialized, setInitialized] = useState(false)
	useEffect(() => {
		if (query.data && !initialized) {
			setAmounts(
				Object.fromEntries(
					query.data.lines.map((line) => [line.id, line.quantity])
				)
			)
			setIncluded(
				Object.fromEntries(query.data.lines.map((line) => [line.id, true]))
			)
			setInitialized(true)
		}
	}, [query.data, initialized])
	const mutation = useMutation({
		mutationFn: async () => {
			if (confirm === 'reject') return externalApi.reject(id, comment)
			const decision: Decision = {
				comment,
				lines: query.data!.lines.map((line) => ({
					lineId: line.id,
					quantity: included[line.id] ? amounts[line.id].replace(',', '.') : '0'
				})),
				receivedAt: receivedAt ? new Date(receivedAt).toISOString() : undefined
			}
			return externalApi.accept(id, decision)
		},
		onSuccess: async (result) => {
			setConfirm(null)
			setError('')
			client.setQueryData([...key, 'detail', id], result)
			await Promise.all([
				client.invalidateQueries({ queryKey: key }),
				client.invalidateQueries({ queryKey: ['manager', 'deliveries'] }),
				client.invalidateQueries({ queryKey: ['manager', 'warehouse'] }),
				client.invalidateQueries({ queryKey: ['manager', 'statistics'] })
			])
			toast.success(
				result.status === 'REJECTED' ? 'Заявка отклонена' : 'Поставка принята'
			)
		},
		onError: (e) => {
			setError(managerError(e))
			setConfirm(null)
		}
	})
	const request = query.data
	const validate = () => {
		if (!request) return
		let count = 0
		for (const line of request.lines) {
			if (!included[line.id]) continue
			const value = amounts[line.id]?.replace(',', '.')
			if (
				!/^\d{1,9}(\.\d{1,3})?$/.test(value) ||
				Number(value) <= 0 ||
				Number(value) > Number(line.quantity)
			) {
				setError(
					'Укажите положительное количество не больше заявленного, до трёх знаков после запятой.'
				)
				return
			}
			count++
		}
		if (!count) {
			setError('Выберите хотя бы одну строку или отклоните заявку.')
			return
		}
		if (receivedAt && !Number.isFinite(+new Date(receivedAt))) {
			setError('Проверьте дату приёмки')
			return
		}
		setError('')
		setConfirm('accept')
	}
	return (
		<Modal
			isOpen
			onClose={() => {
				if (!mutation.isPending && !confirm) onClose()
			}}
			className="max-w-5xl"
		>
			{query.isPending ? (
				<Loading label="Загрузка заявки…" />
			) : query.isError ? (
				<p role="alert">{managerError(query.error)}</p>
			) : (
				request && (
					<>
						<h2 className="pr-8">Накладная {request.number}</h2>
						<p className="mt-2">
							{request.supplierNameAtSubmission} · {request.interface.name}
						</p>
						<p className="mb-5 text-caption text-ink-muted">
							Отправлена {receiptDate(request.submittedAt)} ·{' '}
							{requestStatus[request.status]}
						</p>
						<div className="overflow-auto">
							<table className="w-full text-left text-caption">
								<thead>
									<tr>
										{[
											'Принять',
											'Продукт / партия',
											'Заявлено',
											'Принято / к приёмке'
										].map((label) => (
											<th key={label} className="px-3 py-3">
												{label}
											</th>
										))}
									</tr>
								</thead>
								<tbody>
									{request.lines.map((line) => (
										<tr key={line.id} className="border-t border-border">
											<td className="px-3 py-3">
												{request.status === 'PENDING' ? (
													<input
														type="checkbox"
														aria-label={`Принять ${line.productNameAtSubmission}, строка ${line.id}`}
														checked={!!included[line.id]}
														disabled={mutation.isPending}
														onChange={(e) =>
															setIncluded({
																...included,
																[line.id]: e.target.checked
															})
														}
													/>
												) : (
													requestStatus[line.status]
												)}
											</td>
											<th
												scope="row"
												className="min-w-52 px-3 py-3 font-normal"
											>
												<span className="font-semibold">
													{line.productNameAtSubmission}
												</span>
												<p className="mt-1 text-ink-muted">
													Годен до {receiptDate(line.expiresAt)}
												</p>
											</th>
											<td className="px-3 py-3">
												{line.quantity} {line.unitNameAtSubmission}
											</td>
											<td className="px-3 py-3">
												{request.status === 'PENDING' ? (
													<label className={catalogLabel}>
														<span className="sr-only">
															Количество для {line.productNameAtSubmission},
															строка {line.id}
														</span>
														<input
															className={`${catalogInput} min-w-28`}
															inputMode="decimal"
															value={amounts[line.id] ?? ''}
															disabled={
																!included[line.id] || mutation.isPending
															}
															onChange={(e) =>
																setAmounts({
																	...amounts,
																	[line.id]: e.target.value
																})
															}
														/>
														<span>{line.unitNameAtSubmission}</span>
													</label>
												) : (
													`${line.acceptedQuantity ?? '0'} ${line.unitNameAtSubmission}`
												)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
						{request.status === 'PENDING' ? (
							<>
								<div className="mt-5 grid gap-4 sm:grid-cols-2">
									<label className={catalogLabel}>
										Дата приёмки (необязательно)
										<input
											type="datetime-local"
											className={catalogInput}
											value={receivedAt}
											disabled={mutation.isPending}
											onChange={(e) => setReceivedAt(e.target.value)}
										/>
										<span className="text-caption text-ink-muted">
											Если не заполнить — время подтверждения.
										</span>
									</label>
									<label className={catalogLabel}>
										Комментарий (необязательно)
										<textarea
											className={catalogInput}
											value={comment}
											maxLength={1000}
											disabled={mutation.isPending}
											onChange={(e) => setComment(e.target.value)}
										/>
									</label>
								</div>
								<p className="my-4 text-caption text-ink-muted">
									Приёмка закрывает заявку окончательно. Исключённые строки и
									непринятое количество считаются отклонёнными.
								</p>
								{error && (
									<p role="alert" className="my-3 text-danger">
										{error}
									</p>
								)}
								<div className="flex flex-wrap gap-3">
									<Button
										disabled={mutation.isPending || !initialized}
										onClick={validate}
									>
										Принять поставку
									</Button>
									<Button
										variant="secondary"
										disabled={mutation.isPending}
										onClick={() => setConfirm('reject')}
									>
										Отклонить заявку
									</Button>
								</div>
							</>
						) : (
							<div className="mt-5">
								<p>
									Решение: {request.reviewedBy?.name} ·{' '}
									{request.reviewedAt && receiptDate(request.reviewedAt)}
								</p>
								{request.comment && (
									<p className="mt-2 whitespace-pre-wrap">{request.comment}</p>
								)}
								{request.deliveryId && (
									<Link
										className="mt-3 inline-block font-semibold text-gold-ink underline"
										href={`${MANAGER_ROUTES.DELIVERIES}/${request.deliveryId}`}
									>
										Открыть проведённую поставку
									</Link>
								)}
							</div>
						)}
						{confirm && (
							<div
								role="alertdialog"
								aria-modal="true"
								aria-label="Подтверждение решения"
								className="mt-5 rounded-lg border border-border-strong bg-tint p-5"
							>
								<h3>
									{confirm === 'accept'
										? 'Подтвердить приёмку?'
										: 'Отклонить заявку целиком?'}
								</h3>
								<p className="my-3">
									{confirm === 'accept'
										? `Будут приняты строки: ${request.lines.filter((line) => included[line.id]).length} из ${request.lines.length}. Остальное будет отклонено.`
										: 'Остатки склада не изменятся.'}{' '}
									Решение окончательное.
								</p>
								<div className="flex gap-3">
									<Button
										disabled={mutation.isPending}
										onClick={() => mutation.mutate()}
									>
										Да, подтвердить
									</Button>
									<Button
										variant="secondary"
										disabled={mutation.isPending}
										onClick={() => setConfirm(null)}
									>
										Нет
									</Button>
								</div>
							</div>
						)}
					</>
				)
			)}
		</Modal>
	)
}
