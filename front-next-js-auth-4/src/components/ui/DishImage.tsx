import { BACKEND_URL } from '@/constants'
import { TbToolsKitchen2 } from 'react-icons/tb'
import { twMerge } from '@/utils/tw-merge'

interface Props {
	// Путь от бэкенда: /uploads/dishes/<файл>
	image: string | null
	alt: string
	className?: string
	muted?: boolean
}

export const dishImageUrl = (image: string) => `${BACKEND_URL}${image}`

// Фото блюда; без фото — нейтральная заглушка того же размера
export function DishImage({ image, alt, className, muted }: Props) {
	if (!image) {
		return (
			<div
				className={twMerge(
					'flex shrink-0 items-center justify-center rounded-md bg-tint text-ink-muted',
					className
				)}
				role="img"
				aria-label={`${alt}: фото нет`}
			>
				<TbToolsKitchen2
					size={28}
					aria-hidden
				/>
			</div>
		)
	}

	return (
		// eslint-disable-next-line @next/next/no-img-element -- фото раздаёт бэкенд, next/image потребовал бы настройки доменов
		<img
			src={dishImageUrl(image)}
			alt={alt}
			loading="lazy"
			className={twMerge(
				'shrink-0 rounded-md object-cover',
				muted && 'opacity-60 grayscale',
				className
			)}
		/>
	)
}
