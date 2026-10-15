import { selectHotOffers } from './hot-selection'

const now = new Date('2026-10-15T12:00:00Z')
const later = '2026-10-15T14:00:00Z'
const row = (id: string, score = 0, manualHotUntil: string | null = null) => ({
	id,
	name: id,
	score,
	manualHotUntil,
	manualHotEnabled: manualHotUntil !== null,
	portions: 5,
	isStopped: false
})

describe('manual and automatic hot offers', () => {
	it('keeps three automatic offers when a separate manual offer is added and removed', () => {
		const rows = [
			row('auto-1', 30),
			row('auto-2', 20),
			row('auto-3', 10),
			row('extra')
		]
		const baseline = selectHotOffers(rows, 3, now)
		const assigned = selectHotOffers(
			rows.map((item) =>
				item.id === 'extra' ? { ...item, manualHotEnabled: true } : item
			),
			3,
			now
		)
		expect(
			assigned
				.filter((item) => item.hotSource === 'AUTO')
				.map((item) => item.id)
		).toEqual(baseline.filter((item) => item.isHot).map((item) => item.id))
		expect(assigned.filter((item) => item.isHot)).toHaveLength(4)
		expect(assigned[0]).toMatchObject({ id: 'extra', hotSource: 'MANUAL' })
		const removed = selectHotOffers(
			assigned.map((item) => ({
				...item,
				manualHotEnabled: false,
				manualHotUntil: null
			})),
			3,
			now
		)
		expect(removed.filter((item) => item.isHot).map((item) => item.id)).toEqual(
			['auto-1', 'auto-2', 'auto-3']
		)
	})
	it('treats three as a ceiling when fewer urgent dishes qualify, independently of manual offers', () => {
		const rows = [
			row('urgent', 1),
			row('fresh-1'),
			row('fresh-2'),
			row('extra')
		]
		const assigned = selectHotOffers(
			rows.map((item) =>
				item.id === 'extra' ? { ...item, manualHotEnabled: true } : item
			),
			3,
			now
		)
		expect(
			assigned
				.filter((item) => item.hotSource === 'AUTO')
				.map((item) => item.id)
		).toEqual(['urgent'])
		expect(assigned.filter((item) => item.isHot)).toHaveLength(2)
		expect(
			selectHotOffers(rows, 3, now).filter((item) => item.isHot)
		).toHaveLength(1)
	})
	it('adds manual offers above the automatic quota and orders manual by deadline', () => {
		const result = selectHotOffers(
			[
				row('automatic', 10),
				row('candidate', 2),
				row('manual', 0, later),
				row('sooner', 0, '2026-10-15T13:00:00Z')
			],
			1,
			now
		)
		expect(result.map((item) => item.id)).toEqual([
			'sooner',
			'manual',
			'automatic',
			'candidate'
		])
		expect(
			result.filter((item) => item.isHot).map((item) => item.hotSource)
		).toEqual(['MANUAL', 'MANUAL', 'AUTO'])
	})
	it('excludes even high scoring manual dishes and fills the automatic quota with others', () => {
		const result = selectHotOffers(
			[row('manual', 100, later), row('other', 1)],
			1,
			now
		)
		expect(result.map((item) => item.hotSource)).toEqual(['MANUAL', 'AUTO'])
		expect(new Set(result.map((item) => item.id)).size).toBe(2)
	})
	it('keeps manual offers when the automatic limit is zero or there are no urgent ingredients', () => {
		expect(
			selectHotOffers([row('manual', 0, later), row('auto', 9)], 0, now)
				.filter((item) => item.isHot)
				.map((item) => item.id)
		).toEqual(['manual'])
	})
	it('suspends a manual assignment during a stop without erasing its deadline', () => {
		const result = selectHotOffers(
			[{ ...row('manual', 10, later), isStopped: true }, row('other', 1)],
			1,
			now
		)
		expect(result[1]).toMatchObject({
			id: 'manual',
			manualHotUntil: later,
			isHot: false,
			hotSource: null
		})
		expect(
			selectHotOffers([row('manual', 0, later)], 0, now)[0].hotSource
		).toBe('MANUAL')
	})
	it('expires at the exact boundary and allows automatic selection afterwards', () => {
		const result = selectHotOffers(
			[row('expired', 10, now.toISOString()), row('other', 1)],
			1,
			now
		)
		expect(result[0]).toMatchObject({
			id: 'expired',
			manualHotUntil: null,
			hotSource: 'AUTO'
		})
	})
	it('orders timed before indefinite assignments and excludes both from automatic slots', () => {
		const result = selectHotOffers(
			[
				{ ...row('z indefinite', 100), manualHotEnabled: true },
				row('auto', 1),
				{ ...row('a indefinite', 50), manualHotEnabled: true },
				row('timed', 0, later)
			],
			1,
			now
		)
		expect(result.map((item) => item.id)).toEqual([
			'timed',
			'a indefinite',
			'z indefinite',
			'auto'
		])
		expect(result.map((item) => item.hotSource)).toEqual([
			'MANUAL',
			'MANUAL',
			'MANUAL',
			'AUTO'
		])
	})
	it('retains indefinite assignments during a stop or stock shortage and restores them', () => {
		const manual = { ...row('manual'), manualHotEnabled: true }
		for (const override of [{ isStopped: true }, { portions: 0 }]) {
			expect(
				selectHotOffers([{ ...manual, ...override }], 0, now)[0]
			).toMatchObject({
				manualHotActive: true,
				manualHotUntil: null,
				hotSource: null
			})
		}
		expect(
			selectHotOffers([manual], 0, new Date('2036-01-01T00:00:00Z'))[0]
				.hotSource
		).toBe('MANUAL')
	})
	it('does not revive a disabled assignment with a future leftover deadline', () => {
		expect(
			selectHotOffers(
				[{ ...row('disabled', 0, later), manualHotEnabled: false }],
				0,
				now
			)[0]
		).toMatchObject({
			manualHotActive: false,
			manualHotUntil: null,
			hotSource: null
		})
	})

	it('does not mark a zero-portion dish as hot or mutate its input', () => {
		const input = [{ ...row('manual', 0, later), portions: 0 }]
		expect(selectHotOffers(input, 2, now)[0].isHot).toBe(false)
		expect(input[0]).not.toHaveProperty('hotSource')
	})
})
