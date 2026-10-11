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
	refreshAutoStops
} from '../inventory/availability'

@Injectable()
export class KitchenService {
	constructor(private prisma: PrismaService) {}

	async getOrders() {
		return this.prisma.order.findMany({
			orderBy: { createDate: 'desc' },
			take: 50,
			select: {
				id: true,
				createDate: true,
				creater: { select: { name: true } },
				items: {
					select: {
						id: true,
						count: true,
						dish: { select: { id: true, name: true } }
					}
				}
			}
		})
	}

	// Продукты с непустыми партиями, партии по сроку (FEFO); просроченные тоже — их и списывают
	async getProducts() {
		return this.prisma.product.findMany({
			orderBy: { nameProduct: 'asc' },
			select: {
				id: true,
				nameProduct: true,
				unit: { select: { name: true } },
				batches: {
					where: { count: { gt: 0 } },
					orderBy: { EXP: 'asc' },
					select: {
						id: true,
						count: true,
						EXP: true,
						delivery: { select: { number: true } }
					}
				}
			}
		})
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
			// Условное обновление: остаток не уйдёт в минус даже при одновременных списаниях
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

			await refreshAutoStops(tx, {
				ingredients: { some: { idProduct: batch.idProduct } }
			})

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
							where: { type: StopType.MANUAL },
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
							stops: [
								...dish.stopLists.map((stop) => ({
									type: stop.type,
									createrName: stop.creater?.name ?? null
								})),
								...(portions === 0
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
	async setManualStop(dishId: string, userId: string) {
		const dish = await this.prisma.dish.findUnique({
			where: { id: dishId, deletedAt: null }
		})
		if (!dish) throw new NotFoundException('Блюдо не найдено')

		return this.prisma.stopList.upsert({
			where: { idDish_type: { idDish: dishId, type: StopType.MANUAL } },
			create: { idDish: dishId, type: StopType.MANUAL, createrId: userId },
			update: {}
		})
	}

	// Кухня снимает только ручной стоп; AUTO снимает система, когда продуктов хватает
	async removeManualStop(dishId: string) {
		await this.prisma.stopList.deleteMany({
			where: { idDish: dishId, type: StopType.MANUAL }
		})
		return true
	}
}
