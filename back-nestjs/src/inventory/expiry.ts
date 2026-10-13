// Общие правила сроков годности. Все формулы склада, кухни и официанта
// опираются только на эти функции, чтобы одна партия везде имела один статус.
// Время всегда серверное: «сейчас» передаёт вызывающий код

export const MINUTE_MS = 60 * 1000
export const HOUR_MS = 60 * MINUTE_MS

export type ExpirySettings = {
	cookReserveMinutes: number
	urgentPercent: number
	urgentMinHours: number
	urgentMaxHours: number
}

export type ExpiryPolicy = {
	/** Меньше этого до конца срока — из партии уже не готовят */
	cookReserveMs: number
	/** Доля срока хранения, начиная с которой партия срочная */
	urgentShare: number
	urgentMinMs: number
	urgentMaxMs: number
}

export function expiryPolicy(settings: ExpirySettings): ExpiryPolicy {
	return {
		cookReserveMs: settings.cookReserveMinutes * MINUTE_MS,
		urgentShare: settings.urgentPercent / 100,
		urgentMinMs: settings.urgentMinHours * HOUR_MS,
		urgentMaxMs: settings.urgentMaxHours * HOUR_MS
	}
}

/**
 * Граница годности для готовки: партия годна, если её срок строго позже.
 * Партия, которая истекает через минуту, в остаток и списание по заказу не идёт
 */
export function usableAfter(now: Date, policy: ExpiryPolicy) {
	return new Date(now.getTime() + policy.cookReserveMs)
}

export function isUsable(expiresAt: Date, now: Date, policy: ExpiryPolicy) {
	return expiresAt.getTime() > usableAfter(now, policy).getTime()
}

/**
 * Окно срочности партии: доля её срока хранения (от приёмки до «годен до»),
 * зажатая между минимумом и максимумом. Молоко на 5 суток срочное за 30 ч,
 * мука на год — за 7 дн, а не за 3 месяца
 */
export function urgentWindowMs(
	expiresAt: Date,
	receivedAt: Date,
	policy: ExpiryPolicy
) {
	const shelfLifeMs = Math.max(expiresAt.getTime() - receivedAt.getTime(), 0)
	return Math.min(
		Math.max(shelfLifeMs * policy.urgentShare, policy.urgentMinMs),
		policy.urgentMaxMs
	)
}

/**
 * expired — срок наступил;
 * unusable — ещё не просрочена, но приготовить уже не успеть (меньше запаса);
 * urgent — осталось не больше окна срочности;
 * fresh — всё остальное
 */
export type BatchStatus = 'expired' | 'unusable' | 'urgent' | 'fresh'

export function batchStatus(
	expiresAt: Date,
	receivedAt: Date,
	now: Date,
	policy: ExpiryPolicy
): BatchStatus {
	const leftMs = expiresAt.getTime() - now.getTime()
	if (leftMs <= 0) return 'expired'
	if (leftMs <= policy.cookReserveMs) return 'unusable'
	if (leftMs <= urgentWindowMs(expiresAt, receivedAt, policy)) return 'urgent'
	return 'fresh'
}
