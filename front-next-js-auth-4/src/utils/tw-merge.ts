import { extendTailwindMerge } from 'tailwind-merge'

// Свои размеры шрифта из globals.css. Без них tailwind-merge считает text-body
// цветом и стирает text-on-accent: текст кнопки сливается с фоном
export const twMerge = extendTailwindMerge({
	extend: {
		classGroups: {
			'font-size': [{ text: ['caption', 'label', 'body', 'title'] }]
		}
	}
})
