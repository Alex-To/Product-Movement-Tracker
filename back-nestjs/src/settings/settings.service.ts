import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { expiryPolicy } from '../inventory/expiry'
import { PrismaService } from '../prisma.service'
import { DEFAULT_SETTINGS, SETTINGS_ID } from './settings.defaults'
import { SettingsDto } from './settings.dto'

export { DEFAULT_SETTINGS } from './settings.defaults'

const select = {
	cookReserveMinutes: true,
	urgentPercent: true,
	urgentMinHours: true,
	urgentMaxHours: true,
	hotLimit: true,
	demandDays: true,
	updatedAt: true
} satisfies Prisma.SettingsSelect

@Injectable()
export class SettingsService {
	private readonly logger = new Logger(SettingsService.name)
	private readonly listeners: (() => unknown)[] = []

	constructor(private readonly prisma: PrismaService) {}

	// Подписка на смену настроек: стоп-лист пересчитывается по новому запасу на готовку
	onChange(listener: () => unknown) {
		this.listeners.push(listener)
	}

	// Читается внутри транзакций склада, поэтому принимает и tx
	async get(db: Prisma.TransactionClient | PrismaService = this.prisma) {
		const row = await db.settings.findUnique({
			where: { id: SETTINGS_ID },
			select
		})
		return row ?? { ...DEFAULT_SETTINGS, updatedAt: null }
	}

	async policy(db: Prisma.TransactionClient | PrismaService = this.prisma) {
		return expiryPolicy(await this.get(db))
	}

	async update(dto: SettingsDto) {
		if (dto.urgentMaxHours < dto.urgentMinHours)
			throw new BadRequestException(
				'Верхняя граница срочности не может быть меньше нижней'
			)
		const saved = await this.prisma.settings.upsert({
			where: { id: SETTINGS_ID },
			create: { id: SETTINGS_ID, ...dto },
			update: dto,
			select
		})
		for (const listener of this.listeners) {
			try {
				await listener()
			} catch (error) {
				// Настройки уже сохранены; пересчёт повторит таймер сроков
				this.logger.error('Пересчёт после смены настроек не удался', error)
			}
		}
		return saved
	}
}
