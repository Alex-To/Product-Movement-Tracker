import {
	batchStatus,
	expiryPolicy,
	HOUR_MS,
	isUsable,
	MINUTE_MS,
	urgentWindowMs,
	usableAfter
} from './expiry'

// Утверждённые значения по умолчанию
const policy = expiryPolicy({
	cookReserveMinutes: 30,
	urgentPercent: 25,
	urgentMinHours: 24,
	urgentMaxHours: 168
})
const now = new Date('2026-10-13T12:00:00.000Z')
const at = (ms: number) => new Date(now.getTime() + ms)
const DAY_MS = 24 * HOUR_MS

describe('expiryPolicy', () => {
	it('переводит настройки в миллисекунды и долю', () => {
		expect(policy).toEqual({
			cookReserveMs: 30 * MINUTE_MS,
			urgentShare: 0.25,
			urgentMinMs: 24 * HOUR_MS,
			urgentMaxMs: 168 * HOUR_MS
		})
	})
})

describe('годность для готовки', () => {
	it('граница — сейчас + запас', () => {
		expect(usableAfter(now, policy)).toEqual(at(30 * MINUTE_MS))
	})

	it('ровно на границе запаса партия уже не годна', () => {
		expect(isUsable(at(30 * MINUTE_MS), now, policy)).toBe(false)
	})

	it('на миллисекунду позже границы — годна', () => {
		expect(isUsable(at(30 * MINUTE_MS + 1), now, policy)).toBe(true)
	})

	it('просроченная партия не годна', () => {
		expect(isUsable(at(-1), now, policy)).toBe(false)
	})

	it('с нулевым запасом годна любая непросроченная партия', () => {
		const noReserve = { ...policy, cookReserveMs: 0 }
		expect(isUsable(at(1), now, noReserve)).toBe(true)
		expect(isUsable(now, now, noReserve)).toBe(false)
	})
})

describe('окно срочности', () => {
	it('короткий срок хранения — не меньше минимума (24 ч)', () => {
		// 2 суток × 25 % = 12 ч → поднимается до 24 ч
		expect(urgentWindowMs(at(2 * DAY_MS), now, policy)).toBe(24 * HOUR_MS)
	})

	it('средний срок — доля срока хранения', () => {
		// молоко на 5 суток: 25 % = 30 ч
		expect(urgentWindowMs(at(5 * DAY_MS), now, policy)).toBe(30 * HOUR_MS)
	})

	it('длинный срок — не больше максимума (7 дн)', () => {
		// мука на год: 25 % ≈ 3 месяца → 7 дн
		expect(urgentWindowMs(at(365 * DAY_MS), now, policy)).toBe(168 * HOUR_MS)
	})

	it('срок хранения считается от приёмки, а не от «сейчас»', () => {
		const receivedAt = new Date(now.getTime() - 4 * DAY_MS)
		// принята 4 дня назад, годна ещё 1 день: срок хранения 5 суток → окно 30 ч
		expect(urgentWindowMs(at(DAY_MS), receivedAt, policy)).toBe(30 * HOUR_MS)
	})

	it('приёмка позже срока (кривые данные) — окно не отрицательное', () => {
		expect(urgentWindowMs(now, at(DAY_MS), policy)).toBe(24 * HOUR_MS)
	})
})

describe('статус партии', () => {
	const receivedAt = new Date(now.getTime() - 4 * DAY_MS) // окно 30 ч для срока +1 день
	const status = (leftMs: number, received = receivedAt) =>
		batchStatus(at(leftMs), received, now, policy)

	it('срок равен «сейчас» — просрочена', () => {
		expect(status(0)).toBe('expired')
	})

	it('срок прошёл — просрочена', () => {
		expect(status(-HOUR_MS)).toBe('expired')
	})

	it('меньше запаса на готовку — нельзя готовить', () => {
		expect(status(1)).toBe('unusable')
		expect(status(30 * MINUTE_MS)).toBe('unusable')
	})

	it('сразу после запаса — срочная', () => {
		expect(status(30 * MINUTE_MS + 1)).toBe('urgent')
	})

	it('ровно на границе окна — срочная, на миллисекунду дальше — свежая', () => {
		const received = new Date(now.getTime() - 3 * DAY_MS) // срок хранения 3 сут + остаток
		// для остатка 30 ч срок хранения 102 ч → окно 25,5 ч, значит 30 ч — свежая
		expect(status(30 * HOUR_MS, received)).toBe('fresh')
		// для остатка 24 ч окно = max(96 ч × 25 %, 24 ч) = 24 ч → срочная
		expect(status(24 * HOUR_MS, received)).toBe('urgent')
		expect(status(24 * HOUR_MS + 1, received)).toBe('fresh')
	})

	it('запас важнее окна: при огромном окне партия у самого срока — нельзя готовить', () => {
		const wide = { ...policy, urgentMinMs: 1000 * HOUR_MS, urgentMaxMs: 1000 * HOUR_MS }
		expect(batchStatus(at(10 * MINUTE_MS), receivedAt, now, wide)).toBe('unusable')
	})
})
