'use client'
import { useServerNow } from '@/hooks/useServerNow'
import { remainingTime, type WarehouseBatch } from './warehouse.api'

// Отсчёт «осталось» тикает сам каждую секунду, не дожидаясь обновления склада
export function RemainingTime({ batch }: { batch: WarehouseBatch }) {
	const now = useServerNow(1000)
	return <>{remainingTime(batch, now)}</>
}
