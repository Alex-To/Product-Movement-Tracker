import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma.service'
import { DEFAULT_SETTINGS, SETTINGS_ID } from '../settings/settings.defaults'
import { expiryPolicy } from './expiry'

// Правила сроков из настроек ресторана. Читается внутри тех же транзакций,
// что и склад, поэтому смена настроек не смешается с подсчётом остатков
export async function loadExpiryPolicy(
	db: Prisma.TransactionClient | PrismaService
) {
	const row = await db.settings.findUnique({
		where: { id: SETTINGS_ID },
		select: {
			cookReserveMinutes: true,
			urgentPercent: true,
			urgentMinHours: true,
			urgentMaxHours: true
		}
	})
	return expiryPolicy(row ?? DEFAULT_SETTINGS)
}
