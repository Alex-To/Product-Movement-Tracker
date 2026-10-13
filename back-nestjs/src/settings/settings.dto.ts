import { IsInt, Max, Min } from 'class-validator'

const whole = (field: string) => ({ message: `${field} — целое число` })

export class SettingsDto {
	@IsInt(whole('Запас на готовку'))
	@Min(0, { message: 'Запас на готовку — от 0 минут' })
	@Max(240, { message: 'Запас на готовку — не больше 240 минут' })
	cookReserveMinutes: number

	@IsInt(whole('Доля срока'))
	@Min(1, { message: 'Доля срока — от 1 %' })
	@Max(100, { message: 'Доля срока — не больше 100 %' })
	urgentPercent: number

	@IsInt(whole('Нижняя граница срочности'))
	@Min(0, { message: 'Нижняя граница срочности — от 0 часов' })
	@Max(720, { message: 'Нижняя граница срочности — не больше 30 дней' })
	urgentMinHours: number

	@IsInt(whole('Верхняя граница срочности'))
	@Min(1, { message: 'Верхняя граница срочности — от 1 часа' })
	@Max(2160, { message: 'Верхняя граница срочности — не больше 90 дней' })
	urgentMaxHours: number

	@IsInt(whole('Количество горячих блюд'))
	@Min(0, { message: 'Горячих блюд — от 0' })
	@Max(10, { message: 'Горячих блюд — не больше 10' })
	hotLimit: number

	@IsInt(whole('Период спроса'))
	@Min(1, { message: 'Период спроса — от 1 дня' })
	@Max(90, { message: 'Период спроса — не больше 90 дней' })
	demandDays: number
}
