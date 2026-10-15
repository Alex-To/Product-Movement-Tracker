'use client'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Loading } from '@/components/ui/PizzaLoader'
import { managerError } from '../api/manager.api'
import { catalogInput, catalogLabel } from '../products/styles'
import { externalApi } from './external.api'

export function ApiKeyDialog({
	source,
	onClose
}: {
	source: { id: string; name: string; key?: string }
	onClose: () => void
}) {
	const [key, setKey] = useState<string | null>(source.key ?? null),
		[loading, setLoading] = useState(!source.key),
		[error, setError] = useState(''),
		[saved, setSaved] = useState(''),
		[saving, setSaving] = useState(false),
		[legacy, setLegacy] = useState(false),
		[retry, setRetry] = useState(0)
	useEffect(() => {
		if (source.key) return
		setLoading(true)
		setError('')
		const controller = new AbortController()
		externalApi
			.readKey(source.id, controller.signal)
			.then((result) => {
				if (!controller.signal.aborted) {
					setKey(result.key)
					setLegacy(result.key === null)
				}
			})
			.catch((e) => {
				if (!controller.signal.aborted) setError(managerError(e))
			})
			.finally(() => {
				if (!controller.signal.aborted) setLoading(false)
			})
		return () => controller.abort()
	}, [source.id, source.key, retry])
	return (
		<Modal
			isOpen
			onClose={() => {
				if (!saving) onClose()
			}}
		>
			<h2 className="pr-8">{source.key ? 'API-ключ создан' : 'API-ключ'}</h2>
			<p className="mt-3 break-words font-semibold">{source.name}</p>
			{loading ? (
				<Loading label="Загрузка ключа…" />
			) : key ? (
				<>
					<p className="my-4 text-ink-muted">
						Используйте полный ключ в заголовке X-API-Key. Он доступен для
						повторного просмотра в списке интерфейсов.
					</p>
					<code
						className="block break-all rounded-md bg-tint p-3"
						data-testid="api-key"
					>
						{key}
					</code>
					<div className="mt-5 flex flex-wrap gap-3">
						<Button
							onClick={async () => {
								try {
									await navigator.clipboard.writeText(key)
									toast.success('Ключ скопирован')
								} catch {
									toast.error('Не удалось скопировать. Выделите ключ вручную.')
								}
							}}
						>
							Скопировать
						</Button>
						<Button
							variant="secondary"
							onClick={() => {
								const url = URL.createObjectURL(
										new Blob([key], { type: 'text/plain;charset=utf-8' })
									),
									link = document.createElement('a')
								link.href = url
								link.download = `external-interface-${source.id}.txt`
								document.body.append(link)
								link.click()
								link.remove()
								setTimeout(() => URL.revokeObjectURL(url), 0)
							}}
						>
							Скачать .txt
						</Button>
						<Button variant="secondary" onClick={onClose}>
							{source.key ? 'Сохранено, закрыть' : 'Закрыть окно'}
						</Button>
					</div>
				</>
			) : legacy ? (
				<form
					onSubmit={async (e) => {
						e.preventDefault()
						setSaving(true)
						setError('')
						try {
							const result = await externalApi.rememberKey(
								source.id,
								saved.trim()
							)
							setKey(result.key)
							setSaved('')
						} catch (e) {
							setError(managerError(e))
						} finally {
							setSaving(false)
						}
					}}
				>
					<p className="my-4 text-ink-muted">
						Этот ключ создан до добавления повторного просмотра. Вставьте его из
						Insomnia или сохранённой копии один раз — после этого его можно
						будет открывать, копировать и скачивать здесь. Сам ключ останется
						прежним.
					</p>
					<label className={catalogLabel}>
						Ранее созданный API-ключ
						<input
							className={catalogInput}
							type="password"
							autoComplete="off"
							value={saved}
							disabled={saving}
							onChange={(e) => setSaved(e.target.value)}
							required
							maxLength={81}
						/>
					</label>
					<Button
						className="mt-4"
						type="submit"
						disabled={saving || !saved.trim()}
					>
						Сохранить для просмотра
					</Button>
				</form>
			) : null}
			{error && (
				<>
					<p role="alert" className="mt-4 text-danger">
						{error}
					</p>
					{!key && !legacy && (
						<Button
							className="mt-3"
							variant="secondary"
							onClick={() => setRetry(retry + 1)}
						>
							Повторить
						</Button>
					)}
				</>
			)}
		</Modal>
	)
}
