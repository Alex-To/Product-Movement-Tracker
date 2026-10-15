import { compareByPriority, pickHot } from './hot-offers'

export type HotSource = 'MANUAL' | 'AUTO' | null
export type HotState = {
	isHot: boolean
	hotSource: HotSource
	manualHotUntil: string | null
	manualHotActive: boolean
}

type Candidate = {
	id: string
	name: string
	portions: number
	score: number
	isStopped: boolean
	manualHotUntil: string | null
	manualHotEnabled: boolean
}

// Only active manual assignments occupy the manual group. They never consume
// automatic slots, including while temporarily unavailable.
export function selectHotOffers<T extends Candidate>(
	rows: T[],
	limit: number,
	now: Date
) {
	const candidates = rows.map(({ manualHotEnabled, ...row }) => {
		const manualHotActive =
			manualHotEnabled &&
			(row.manualHotUntil === null ||
				Date.parse(row.manualHotUntil) > now.getTime())
		return {
			...row,
			manualHotActive,
			manualHotUntil: manualHotActive ? row.manualHotUntil : null
		}
	})
	const automatic = pickHot(
		candidates.filter((row) => !row.isStopped && !row.manualHotActive),
		limit
	)
	const selected = candidates.map((row) => {
		const hotSource: HotSource =
			row.isStopped || row.portions <= 0
				? null
				: row.manualHotActive
					? 'MANUAL'
					: automatic.has(row.id)
						? 'AUTO'
						: null
		return { ...row, isHot: hotSource !== null, hotSource }
	})
	const group = (row: (typeof selected)[number]) =>
		row.isStopped
			? 3
			: row.hotSource === 'MANUAL'
				? 0
				: row.hotSource === 'AUTO'
					? 1
					: 2
	return selected.sort((a, b) => {
		const difference = group(a) - group(b)
		if (difference) return difference
		if (a.hotSource === 'MANUAL' && b.hotSource === 'MANUAL')
			return (
				(a.manualHotUntil === null ? Infinity : Date.parse(a.manualHotUntil)) -
					(b.manualHotUntil === null
						? Infinity
						: Date.parse(b.manualHotUntil)) ||
				a.name.localeCompare(b.name, 'ru') ||
				a.id.localeCompare(b.id)
			)
		return compareByPriority(a, b) || a.id.localeCompare(b.id)
	})
}
