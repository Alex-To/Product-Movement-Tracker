export const HOT_TIME_ZONE = 'Europe/Simferopol'

// datetime-local has no timezone. Both directions explicitly use restaurant time.
export function manualHotInput(iso: string): string {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat('en-CA', {
			timeZone: HOT_TIME_ZONE,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23'
		})
			.formatToParts(new Date(iso))
			.map((part) => [part.type, part.value])
	)
	return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

export function manualHotIso(value: string): string {
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
		throw new Error('Выберите дату и время окончания')
	const wall = Date.parse(`${value}:00Z`)
	if (
		!Number.isFinite(wall) ||
		new Date(wall).toISOString().slice(0, 16) !== value
	)
		throw new Error('Укажите существующую дату и время')
	let instant = wall
	for (let i = 0; i < 3; i++) {
		const displayed = Date.parse(
			`${manualHotInput(new Date(instant).toISOString())}:00Z`
		)
		instant += wall - displayed
	}
	const iso = new Date(instant).toISOString()
	if (manualHotInput(iso) !== value)
		throw new Error('Это время недоступно в часовом поясе ресторана')
	return iso
}

export const formatManualHotUntil = (value: string) =>
	new Date(value).toLocaleString('ru-RU', {
		timeZone: HOT_TIME_ZONE,
		dateStyle: 'short',
		timeStyle: 'short'
	})
