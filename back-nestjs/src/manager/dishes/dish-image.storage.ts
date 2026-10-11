import { randomUUID } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

// Фото лежат на диске бэкенда и раздаются статикой (main.ts): /uploads/dishes/<файл>
export const UPLOADS_DIR = join(process.cwd(), 'uploads')
export const DISH_IMAGES_DIR = join(UPLOADS_DIR, 'dishes')
export const DISH_IMAGES_URL = '/uploads/dishes'
export const DISH_IMAGE_MAX_BYTES = 5 * 1024 * 1024

// Минимум из multer: типов @types/multer в проекте нет
export interface UploadedImage {
	buffer: Buffer
	size: number
}

// Формат определяем по сигнатуре файла, а не по расширению и mimetype от клиента
export function detectImageExtension(buffer: Buffer) {
	if (buffer.length < 12) return null
	if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg'
	if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
		return 'png'
	if (
		buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
		buffer.subarray(8, 12).toString('ascii') === 'WEBP'
	)
		return 'webp'
	return null
}

export async function saveDishImage(dishId: string, buffer: Buffer, ext: string) {
	await mkdir(DISH_IMAGES_DIR, { recursive: true })
	// Новое имя на каждую загрузку — браузеры не покажут старое фото из кэша
	const file = `${dishId}-${randomUUID()}.${ext}`
	await writeFile(join(DISH_IMAGES_DIR, file), buffer)
	return `${DISH_IMAGES_URL}/${file}`
}

export async function removeDishImage(image: string | null) {
	if (!image?.startsWith(`${DISH_IMAGES_URL}/`)) return
	// basename не даёт выйти за пределы папки с фото
	await unlink(join(DISH_IMAGES_DIR, basename(image))).catch(() => undefined)
}
