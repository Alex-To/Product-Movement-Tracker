// Формат по брендбуку: «2,5 кг», «15.10 12:00»

export const formatAmount = (value: string, unit?: string) => {
	const number = Number(value).toLocaleString('ru-RU', {
		maximumFractionDigits: 3
	})
	return unit ? `${number} ${unit}` : number
}

export const formatDateTime = (value: string) =>
	new Date(value).toLocaleString('ru-RU', {
		day: '2-digit',
		month: '2-digit',
		hour: '2-digit',
		minute: '2-digit'
	})

export const isExpired = (exp: string) => new Date(exp).getTime() <= Date.now()
