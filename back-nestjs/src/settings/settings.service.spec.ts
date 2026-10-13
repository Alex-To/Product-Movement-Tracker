import { BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { DEFAULT_SETTINGS, SettingsService } from './settings.service'

function serviceWith(row: unknown) {
	const settings = {
		findUnique: jest.fn().mockResolvedValue(row),
		upsert: jest.fn().mockImplementation(({ update }) => Promise.resolve(update))
	}
	const prisma = { settings } as unknown as PrismaService
	return { service: new SettingsService(prisma), settings }
}

describe('SettingsService', () => {
	it('без строки в базе отдаёт утверждённые значения по умолчанию', async () => {
		const { service } = serviceWith(null)
		await expect(service.get()).resolves.toEqual({
			...DEFAULT_SETTINGS,
			updatedAt: null
		})
	})

	it('политика сроков строится из сохранённых настроек', async () => {
		const { service } = serviceWith({ ...DEFAULT_SETTINGS, cookReserveMinutes: 45 })
		await expect(service.policy()).resolves.toMatchObject({
			cookReserveMs: 45 * 60 * 1000,
			urgentShare: 0.25
		})
	})

	it('не сохраняет верхнюю границу срочности меньше нижней', async () => {
		const { service, settings } = serviceWith(null)
		await expect(
			service.update({ ...DEFAULT_SETTINGS, urgentMinHours: 48, urgentMaxHours: 24 })
		).rejects.toBeInstanceOf(BadRequestException)
		expect(settings.upsert).not.toHaveBeenCalled()
	})

	it('равные границы допустимы', async () => {
		const { service, settings } = serviceWith(null)
		await service.update({ ...DEFAULT_SETTINGS, urgentMinHours: 24, urgentMaxHours: 24 })
		expect(settings.upsert).toHaveBeenCalledTimes(1)
	})
})
