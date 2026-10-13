import { PrismaService } from '@/prisma.service'
import {
	BadRequestException,
	Injectable,
	NotFoundException
} from '@nestjs/common'
import { MessageType, Prisma, Role, StopType } from '@prisma/client'
import { WriteOffDto } from './dto/write-off.dto'
import {
	availableStock,
	countPortions,
	inventoryTransaction,
	OPEN_STOP,
	refreshAutoStops
} from '../inventory/availability'
import { batchStatus, isUsable } from '../inventory/expiry'
import { loadExpiryPolicy } from '../inventory/policy'

@Injectable()
export class KitchenService {
	constructor(private prisma: PrismaService) {}

	async getOrders() {
		return this.prisma.order.findMany({
			orderBy: [{ createDate: 'desc' }, { id: 'desc' }],
			take: 50,
			select: {
				id: true,
				// Номер записан в заказ при создании: сквозной круг 1…99
				number: true,
				createDate: true,
				readyAt: true,
				creater: { select: { name: true } },
				items: {
					select: {
						id: true,
						count: true,
						dish: { select: { id: true, name: true } },
						// Что гость попросил убрать — повар готовит без этого
						exclusions: {
							select: { product: { select: { id: true, nameProduct: true } } },
							orderBy: { product: { nameProduct: 'asc' } }
						}
					}
				}
			}
		})
	}
	// Повтор нажатия ничего не меняет: время готовности остаётся первым
	async markOrderReady(orderId: string) {
		const order = await this.prisma.order.findUnique({
			where: { id: orderId },
			select: { id: true, readyAt: true }
		})
		if (!order) throw new NotFoundException('Заказ не найден')
		if (order.readyAt) return order

		await this.prisma.order.updateMany({
			where: { id: orderId, readyAt: null },
			data: { readyAt: new Date() }
		})
		return this.prisma.order.findUnique({
			where: { id: orderId },
			select: { id: true, readyAt: true }
		})
	}
	async getProducts() {
		const now = new Date()
		const policy = await loadExpiryPolicy(this.prisma)
		const products = await this.prisma.product.findMany({
			orderBy: { nameProduct: 'asc' },
			select: {
				id: true,
				nameProduct: true,
				unit: { select: { name: true } },
				batches: {
					where: { count: { gt: 0 } },
					// Порядок FEFO, как при списании по заказу
					orderBy: [{ EXP: 'asc' }, { delivery: { createDate: 'asc' } }, { id: 'asc' }],
					select: {
						id: true,
						count: true,
						EXP: true,
						delivery: { select: { number: true, createDate: true } }
					}
				}
			}
		})
		// Статус решает сервер: часы на кухонном планшете могут врать.
		// Из партий «нельзя готовить» и просроченных кухня не берёт — их списывает менеджер
		return products.map(product => ({
			...product,
			batches: product.batches.map(({ delivery, ...batch }) => {
				const status = batchStatus(batch.EXP, delivery.createDate, now, policy)
				return {
					...batch,
					delivery: { number: delivery.number },
					status,
					expired: status === 'expired'
				}
			})
		}))
	}

	async getMyWriteOffs(userId: string) {
		return this.prisma.stockMovement.findMany({
			where: { createrId: userId, idOrder: null },
			orderBy: { createDate: 'desc' },
			take: 20,
			select: {
				id: true,
				count: true,
				createDate: true,
				batch: {
					select: {
						delivery: { select: { number: true } },
						product: {
							select: { nameProduct: true, unit: { select: { name: true } } }
						}
					}
				}
			}
		})
	}

	async writeOff(userId: string, dto: WriteOffDto) {
		const count = new Prisma.Decimal(dto.count.replace(',', '.'))
		if (count.lte(0)) {
			throw new BadRequestException('Количество должно быть больше нуля')
		}

		return inventoryTransaction(this.prisma, async (tx) => {
			const now = new Date()
			const policy = await loadExpiryPolicy(tx)
			const current = await tx.batch.findUnique({
				where: { id: dto.batchId },
				select: { EXP: true }
			})
			if (!current) throw new NotFoundException('Партия не найдена')
			if (!isUsable(current.EXP, now, policy))
				throw new BadRequestException(
					'Из этой партии уже нельзя готовить — её целиком списывает менеджер'
				)

			const updated = await tx.batch.updateMany({
				where: { id: dto.batchId, count: { gte: count } },
				data: { count: { decrement: count } }
			})

			const batch = await tx.batch.findUnique({
				where: { id: dto.batchId },
				select: { count: true, idProduct: true }
			})
			if (!batch) throw new NotFoundException('Партия не найдена')
			if (updated.count === 0) {
				throw new BadRequestException(
					`Нельзя списать больше остатка партии (${batch.count.toString()})`
				)
			}

			const movement = await tx.stockMovement.create({
				data: { idBatch: dto.batchId, count, createrId: userId }
			})

			const managers = await tx.user.findMany({
				where: { role: Role.MANAGER },
				select: { id: true }
			})
			if (managers.length) {
				await tx.message.createMany({
					data: managers.map((manager) => ({
						type: MessageType.WRITE_OFF,
						idRecipient: manager.id,
						idStockMovement: movement.id
					}))
				})
			}

			await refreshAutoStops(
				tx,
				{ ingredients: { some: { idProduct: batch.idProduct } } },
				now,
				policy
			)

			return movement
		})
	}

	async getStopList() {
		return this.prisma.$transaction(
			async (tx) => {
				const dishes = await tx.dish.findMany({
					where: { deletedAt: null },
					orderBy: { name: 'asc' },
					select: {
						id: true,
						name: true,
						ingredients: {
							select: {
								idProduct: true,
								count: true,
								product: { select: { nameProduct: true } }
							}
						},
						stopLists: {
							where: OPEN_STOP,
							select: { type: true, creater: { select: { name: true } } }
						}
					}
				})
				const stock = await availableStock(tx)
				return dishes
					.map((dish) => {
						const portions = countPortions(dish.ingredients, stock)
						return {
							id: dish.id,
							name: dish.name,
							portions,
							missing: dish.ingredients
								.filter((item) =>
									(stock.get(item.idProduct) ?? new Prisma.Decimal(0)).lt(
										item.count
									)
								)
								.map((item) => item.product.nameProduct),
							// Открытые записи стоп-листа; авто-стоп без записи — страховка
							stops: [
								...dish.stopLists.map((stop) => ({
									type: stop.type,
									createrName: stop.creater?.name ?? null
								})),
								...(portions === 0 &&
								!dish.stopLists.some((stop) => stop.type === StopType.AUTO)
									? [{ type: StopType.AUTO, createrName: null }]
									: [])
							]
						}
					})
					.sort(
						(a, b) => Number(b.stops.length > 0) - Number(a.stops.length > 0)
					)
			},
			{ isolationLevel: 'RepeatableRead' }
		)
	}
	// Открытый ручной стоп у блюда один: Serializable не даст двум нажатиям создать два
	async setManualStop(dishId: string, userId: string) {
		return inventoryTransaction(this.prisma, async (tx) => {
			const dish = await tx.dish.findUnique({
				where: { id: dishId, deletedAt: null }
			})
			if (!dish) throw new NotFoundException('Блюдо не найдено')

			const open = await tx.stopList.findFirst({
				where: { idDish: dishId, type: StopType.MANUAL, ...OPEN_STOP }
			})
			return (
				open ??
				tx.stopList.create({
					data: {
						idDish: dishId,
						type: StopType.MANUAL,
						createrId: userId,
						createdAt: new Date()
					}
				})
			)
		})
	}
	// Стоп снимается, а запись остаётся в истории ещё неделю
	async removeManualStop(dishId: string) {
		await this.prisma.stopList.updateMany({
			where: { idDish: dishId, type: StopType.MANUAL, ...OPEN_STOP },
			data: { closedAt: new Date() }
		})
		return true
	}
}
