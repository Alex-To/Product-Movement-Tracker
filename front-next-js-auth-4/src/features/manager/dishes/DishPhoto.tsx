'use client'
import { Button } from '@/components/ui/Button'
import { DishImage } from '@/components/ui/DishImage'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { useRef, useState, type ChangeEvent } from 'react'
import toast from 'react-hot-toast'
import { TbPhotoUp, TbTrash } from 'react-icons/tb'
import { managerError } from '../api/manager.api'
import { dishesApi, dishKeys, type ManagerDish } from './dishes.api'

// Фото уменьшаем в браузере: официанту хватает 1024 px, а загрузка в разы быстрее
const MAX_SIDE = 1024

async function prepareImage(file: File) {
	if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
		throw new Error('Выберите фото в формате JPEG, PNG или WebP')
	}
	const bitmap = await createImageBitmap(file)
	const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
	const canvas = document.createElement('canvas')
	canvas.width = Math.round(bitmap.width * scale)
	canvas.height = Math.round(bitmap.height * scale)
	canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
	bitmap.close()

	return new Promise<Blob>((resolve, reject) =>
		canvas.toBlob(
			blob => (blob ? resolve(blob) : reject(new Error('Не удалось обработать фото'))),
			'image/jpeg',
			0.85
		)
	)
}

export function DishPhoto({ dish }: { dish: ManagerDish }) {
	const client = useQueryClient()
	const input = useRef<HTMLInputElement>(null)
	const [image, setImage] = useState(dish.image)
	const [error, setError] = useState('')

	const onSaved = (saved: ManagerDish) => {
		setImage(saved.image)
		setError('')
		client.invalidateQueries({ queryKey: dishKeys.all })
	}

	const upload = useMutation({
		mutationFn: async (file: File) => dishesApi.uploadImage(dish.id, await prepareImage(file)),
		onSuccess(saved) {
			onSaved(saved)
			toast.success('Фото сохранено — официант уже видит его в меню')
		},
		// Ошибки обработки файла в браузере — свои, сетевые — через общий хелпер менеджера
		onError: e => setError(axios.isAxiosError(e) ? managerError(e) : e.message)
	})

	const remove = useMutation({
		mutationFn: () => dishesApi.removeImage(dish.id),
		onSuccess(saved) {
			onSaved(saved)
			toast.success('Фото убрано из меню')
		},
		onError: e => setError(managerError(e))
	})

	const busy = upload.isPending || remove.isPending

	const onPick = (e: ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0]
		// Сбрасываем, чтобы повторный выбор того же файла тоже сработал
		e.target.value = ''
		if (file) upload.mutate(file)
	}

	return (
		<section
			aria-labelledby="dish-photo-title"
			className="mb-5 flex flex-wrap items-center gap-5 rounded-lg border border-border bg-surface-raised p-5 sm:p-7"
		>
			<DishImage
				image={image}
				alt={dish.name}
				className="size-32"
			/>
			<div className="flex min-w-0 flex-[1_1_240px] flex-col gap-2">
				<h3 id="dish-photo-title">Фото в меню</h3>
				<p className="text-caption text-ink-muted">
					JPEG, PNG или WebP — перед загрузкой уменьшим до {MAX_SIDE} px.
				</p>
				<div className="flex flex-wrap gap-2">
					<input
						ref={input}
						id="dish-photo-file"
						type="file"
						accept="image/jpeg,image/png,image/webp"
						className="sr-only"
						onChange={onPick}
						tabIndex={-1}
					/>
					<Button
						type="button"
						variant="secondary"
						disabled={busy}
						onClick={() => input.current?.click()}
					>
						<TbPhotoUp
							size={18}
							aria-hidden
						/>
						{upload.isPending ? 'Загружаем…' : image ? 'Заменить фото' : 'Загрузить фото'}
					</Button>
					{image && (
						<Button
							type="button"
							variant="ghost"
							disabled={busy}
							onClick={() => remove.mutate()}
						>
							<TbTrash
								size={18}
								aria-hidden
							/>
							{remove.isPending ? 'Убираем…' : 'Убрать фото'}
						</Button>
					)}
				</div>
				{error && (
					<p
						role="alert"
						className="text-caption text-danger"
					>
						{error}
					</p>
				)}
			</div>
		</section>
	)
}
