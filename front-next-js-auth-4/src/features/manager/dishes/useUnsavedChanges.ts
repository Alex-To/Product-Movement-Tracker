'use client'
import { useEffect } from 'react'

export function useUnsavedChanges(dirty: boolean) {
	useEffect(() => {
		if (!dirty) return
		const message = 'Есть несохранённые изменения рецепта. Покинуть страницу?'
		const unload = (event: BeforeUnloadEvent) => {
			event.preventDefault()
			event.returnValue = ''
		}
		const click = (event: MouseEvent) => {
			const anchor = (event.target as Element)?.closest?.('a')
			if (
				!anchor ||
				anchor.target === '_blank' ||
				event.ctrlKey ||
				event.metaKey ||
				event.shiftKey ||
				event.button !== 0 ||
				anchor.href === location.href
			)
				return
			if (!window.confirm(message)) {
				event.preventDefault()
				event.stopImmediatePropagation()
			}
		}
		const navigation = (window as unknown as { navigation?: EventTarget })
			.navigation
		const traverse = (event: Event) => {
			if (
				(event as Event & { navigationType?: string }).navigationType ===
					'traverse' &&
				event.cancelable &&
				!window.confirm(message)
			)
				event.preventDefault()
		}
		window.addEventListener('beforeunload', unload)
		document.addEventListener('click', click, true)
		navigation?.addEventListener('navigate', traverse)
		return () => {
			window.removeEventListener('beforeunload', unload)
			document.removeEventListener('click', click, true)
			navigation?.removeEventListener('navigate', traverse)
		}
	}, [dirty])
}
