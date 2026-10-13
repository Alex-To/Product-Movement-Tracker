import { serverNow } from '@/api/server-clock'
import { useEffect, useState } from 'react'

// Серверное «сейчас», которое само обновляется: для таймеров «осталось»
export function useServerNow(intervalMs = 1000) {
	const [now, setNow] = useState(serverNow)

	useEffect(() => {
		const id = setInterval(() => setNow(serverNow()), intervalMs)
		return () => clearInterval(id)
	}, [intervalMs])

	return now
}
