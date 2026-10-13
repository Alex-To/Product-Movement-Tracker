import { ConflictException, Logger } from '@nestjs/common'
import { RejectionReason } from '@prisma/client'
import type { OrderLine, Shortage } from '../inventory/order-need'
import { PrismaService } from '../prisma.service'

export type RejectionBody = {
	message: string
	stopped: string[]
	shortages: Shortage[]
	available: { dishId: string; name: string; portions: number }[]
}

/**
 * Заказ не принят, склад не тронут. Причину вычисляет сервер; её видит
 * менеджер в журнале отказов. Официант получает прежний ответ 409
 */
export class OrderRejectedException extends ConflictException {
	constructor(
		readonly reason: RejectionReason,
		body: RejectionBody | string,
		// Блюда, из-за которых отказ: их порции — неудовлетворённый спрос
		readonly blockedDishIds: string[] = []
	) {
		super(body)
	}
}

const logger = new Logger('OrderRejections')

/**
 * Запись в журнал — уже после отката транзакции заказа и отдельным запросом.
 * Если запись не удалась, официант всё равно получает исходный отказ
 */
export async function recordRejection(
	prisma: PrismaService,
	waiterId: string,
	lines: OrderLine[],
	rejection: OrderRejectedException
) {
	try {
		const [waiter, dishes] = await Promise.all([
			prisma.user.findUnique({ where: { id: waiterId }, select: { name: true } }),
			prisma.dish.findMany({
				where: { id: { in: lines.map((line) => line.dishId) } },
				select: {
					id: true,
					name: true,
					ingredients: {
						select: { idProduct: true, product: { select: { nameProduct: true } } }
					}
				}
			})
		])
		const dishById = new Map(dishes.map((dish) => [dish.id, dish]))
		const body = rejection.getResponse() as Partial<RejectionBody>

		await prisma.orderRejection.create({
			data: {
				reason: rejection.reason,
				waiterId,
				waiterName: waiter?.name ?? '—',
				lines: lines.map((line) => {
					const dish = dishById.get(line.dishId)
					return {
						dishId: line.dishId,
						dishName: dish?.name ?? 'Удалённое блюдо',
						count: line.count,
						// Блюдо и было причиной отказа — его порции идут в спрос для горячих
						blocked: rejection.blockedDishIds.includes(line.dishId),
						excluded: (dish?.ingredients ?? [])
							.filter((item) => line.excluded.includes(item.idProduct))
							.map((item) => item.product.nameProduct)
					}
				}),
				details: {
					stopped: body.stopped ?? [],
					shortages: (body.shortages ?? []).map((shortage) => ({
						productName: shortage.productName,
						unit: shortage.unit,
						need: shortage.need,
						available: shortage.available
					}))
				}
			}
		})
	} catch (error) {
		logger.error('Не удалось записать отказ в журнал', error)
	}
}
