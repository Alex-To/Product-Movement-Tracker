import { expiryPolicy, HOUR_MS, MINUTE_MS } from './expiry'
import { nextExpiryEvent } from './expiry-jobs'

const policy = expiryPolicy({
	cookReserveMinutes: 30,
	urgentPercent: 25,
	urgentMinHours: 24,
	urgentMaxHours: 168
})
const now = new Date('2026-10-13T12:00:00.000Z')
const at = (ms: number) => new Date(now.getTime() + ms)

describe('nextExpiryEvent — когда склад изменится сам', () => {
	it('нет партий — событий нет', () => {
		expect(nextExpiryEvent([], now, policy)).toBeNull()
	})

	it('годная партия: событие — когда она перестанет годиться для готовки', () => {
		expect(nextExpiryEvent([at(2 * HOUR_MS)], now, policy)).toEqual(
			at(2 * HOUR_MS - 30 * MINUTE_MS)
		)
	})

	it('партия уже «нельзя готовить»: событие — её истечение', () => {
		expect(nextExpiryEvent([at(10 * MINUTE_MS)], now, policy)).toEqual(
			at(10 * MINUTE_MS)
		)
	})

	it('ровно на границе запаса событие уже прошло — ждём истечения', () => {
		expect(nextExpiryEvent([at(30 * MINUTE_MS)], now, policy)).toEqual(
			at(30 * MINUTE_MS)
		)
	})

	it('просроченная партия событий не даёт', () => {
		expect(nextExpiryEvent([now, at(-HOUR_MS)], now, policy)).toBeNull()
	})

	it('берётся самое раннее из событий разных партий', () => {
		// годная через 35 мин перестанет годиться через 5 мин — раньше, чем истечёт «нельзя готовить» через 20 мин
		expect(
			nextExpiryEvent([at(20 * MINUTE_MS), at(35 * MINUTE_MS)], now, policy)
		).toEqual(at(5 * MINUTE_MS))
	})
})
