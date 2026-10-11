const HOUR_MS = 60 * 60 * 1000

export const formatAmount = (value: string, unit?: string) => {
	const number = Number(value).toLocaleString('ru-RU', {
		maximumFractionDigits: 3
	})
	return unit ? `${number} ${unit}` : number
}

export const plural = (n: number, one: string, few: string, many: string) => {
	const mod10 = n % 10
	const mod100 = n % 100
	if (mod10 === 1 && mod100 !== 11) return one
	if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
	return many
}

export const formatPortions = (n: number) =>
	`${n} ${plural(n, 'порция', 'порции', 'порций')}`

export const formatExpiry = (expiresAt: string) => {
	const hours = Math.max(
		Math.ceil((new Date(expiresAt).getTime() - Date.now()) / HOUR_MS),
		0
	)

	if (hours <= 24) return `истекает через ${hours} ч`

	const days = Math.floor(hours / 24)
	const daysText = `${days} ${plural(days, 'день', 'дня', 'дней')}`

	return hours <= 72 ? `истекает через ${daysText}` : `годен ещё ${daysText}`
}
