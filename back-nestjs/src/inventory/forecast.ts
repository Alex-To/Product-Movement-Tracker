import { Prisma } from '@prisma/client'
import { batchStatus, ExpiryPolicy, HOUR_MS } from './expiry'
import { fefoCompare, FefoBatch } from './fefo'

const zero = () => new Prisma.Decimal(0)

/** Continuous demand, shared across recipes before calling this function.
 * All existing stock is available now; no future deliveries are assumed.
 * The horizon ends at now + days, not at the end of a calendar day.
 */
export function forecastProduct(
	batches: FefoBatch[],
	ratePerHour: Prisma.Decimal | null,
	now: Date,
	days: number,
	policy: ExpiryPolicy,
	unitName = ''
) {
	const end = now.getTime() + days * 24 * HOUR_MS
	let usable = zero(),
		expired = zero(),
		unusable = zero(),
		consumed = zero(),
		lost = zero(),
		atRisk = zero()
	const details = [...batches]
		.filter((batch) => batch.count.gt(0))
		.sort(fefoCompare)
		.map((batch) => {
			const status = batchStatus(batch.EXP, batch.receivedAt, now, policy)
			const cutoff = batch.EXP.getTime() - policy.cookReserveMs
			let take = zero(),
				loss = zero()
			if (status === 'expired') expired = expired.plus(batch.count)
			else if (status === 'unusable') unusable = unusable.plus(batch.count)
			else {
				usable = usable.plus(batch.count)
				if (cutoff <= end) atRisk = atRisk.plus(batch.count)
				if (ratePerHour !== null) {
					const hours = Math.max(
						0,
						(Math.min(cutoff, end) - now.getTime()) / HOUR_MS
					)
					take = Prisma.Decimal.min(
						batch.count,
						Prisma.Decimal.max(0, ratePerHour.mul(hours).minus(consumed))
					)
					consumed = consumed.plus(take)
					if (cutoff <= end) {
						loss = batch.count.minus(take)
						lost = lost.plus(loss)
					}
				}
			}
			return {
				id: batch.id,
				quantity: batch.count.toFixed(3),
				expiresAt: batch.EXP.toISOString(),
				usableUntil: new Date(cutoff).toISOString(),
				status,
				expectedUse: ratePerHour === null ? null : take.toFixed(3),
				expectedLoss: ratePerHour === null ? null : loss.toFixed(3)
			}
		})
	const demand = ratePerHour?.mul(days * 24) ?? null
	return {
		usable: usable.toFixed(3),
		expired: expired.toFixed(3),
		unusable: unusable.toFixed(3),
		atRisk: atRisk.toFixed(3),
		dailyDemand: ratePerHour?.mul(24).toFixed(3) ?? null,
		demand: demand?.toFixed(3) ?? null,
		expectedUse: ratePerHour === null ? null : consumed.toFixed(3),
		expectedLoss: ratePerHour === null ? null : lost.toFixed(3),
		toOrder:
			demand === null
				? null
				: Prisma.Decimal.max(0, demand.minus(consumed))
						// Remove repeating-division noise before rounding up for purchase.
						.toDecimalPlaces(9, Prisma.Decimal.ROUND_HALF_UP)
						.toDecimalPlaces(
							isPieceUnit(unitName) ? 0 : 3,
							Prisma.Decimal.ROUND_UP
						)
						.toFixed(3),
		batches: details
	}
}

export function isPieceUnit(name: string) {
	return ['шт', 'шт.', 'штука', 'штуки', 'штук'].includes(
		name.trim().toLocaleLowerCase('ru-RU')
	)
}
