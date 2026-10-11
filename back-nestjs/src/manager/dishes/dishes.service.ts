import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import {
	availableStock,
	countPortions,
	inventoryTransaction,
	refreshAutoStops
} from '../../inventory/availability'
import { PrismaService } from '../../prisma.service'
import { DishesQueryDto, DishInputDto, DishUpdateDto } from './dishes.dto'

const select = {
	id: true,
	name: true,
	version: true,
	deletedAt: true,
	ingredients: {
		orderBy: { id: 'asc' as const },
		select: {
			idProduct: true,
			count: true,
			product: {
				select: {
					id: true,
					nameProduct: true,
					unit: { select: { id: true, name: true } }
				}
			}
		}
	},
	stopLists: { select: { type: true } }
} satisfies Prisma.DishSelect
type Dish = Prisma.DishGetPayload<{ select: typeof select }>
@Injectable()
export class ManagerDishesService {
	constructor(private readonly prisma: PrismaService) {}
	async checkName(name: string, excludeId = '') {
		const [result] = await this.prisma.$queryRaw<
			Array<{ matches: number }>
		>`SELECT count(*)::int AS matches FROM dishes WHERE id_dish <> ${excludeId} AND deleted_at IS NULL AND lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g')) = lower(${name})`
		return result
	}
	async list(query: DishesQueryDto) {
		return this.prisma.$transaction(
			async (tx) => {
				const where: Prisma.DishWhereInput = {
					deletedAt: query.scope === 'trash' ? { not: null } : null,
					...(query.search
						? { name: { contains: query.search, mode: 'insensitive' } }
						: {})
				}
				const rows = await tx.dish.findMany({
					where,
					select,
					orderBy:
						query.scope === 'trash'
							? [{ deletedAt: 'desc' }, { id: 'asc' }]
							: [{ name: 'asc' }, { id: 'asc' }],
					skip: (query.page - 1) * 25,
					take: 25
				})
				const asOf = new Date(),
					stock = await availableStock(
						tx,
						asOf,
						rows.flatMap((dish) =>
							dish.ingredients.map((item) => item.idProduct)
						)
					)
				return {
					items: rows.map((row) => this.present(row, stock)),
					total: await tx.dish.count({ where }),
					page: query.page,
					pageSize: 25,
					generatedAt: asOf.toISOString()
				}
			},
			{ isolationLevel: 'RepeatableRead' }
		)
	}
	async get(id: string) {
		return this.prisma.$transaction(
			async (tx) => {
				const row = await tx.dish.findUnique({ where: { id }, select })
				if (!row) throw new NotFoundException('Блюдо не найдено')
				return this.present(
					row,
					await availableStock(
						tx,
						new Date(),
						row.ingredients.map((item) => item.idProduct)
					)
				)
			},
			{ isolationLevel: 'RepeatableRead' }
		)
	}
	async create(dto: DishInputDto) {
		return inventoryTransaction(this.prisma, async (tx) => {
			await this.checkIngredients(tx, dto)
			const dish = await tx.dish.create({
				data: {
					name: dto.name,
					ingredients: {
						create: dto.ingredients.map((item) => ({
							idProduct: item.productId,
							count: item.quantity
						}))
					}
				}
			})
			await refreshAutoStops(tx, { id: dish.id })
			return this.saved(tx, dish.id)
		})
	}
	async update(id: string, dto: DishUpdateDto) {
		return inventoryTransaction(this.prisma, async (tx) => {
			await this.advance(tx, id, dto.version, false, { name: dto.name })
			await this.checkIngredients(tx, dto)
			await tx.dishIngredient.deleteMany({ where: { idDish: id } })
			await tx.dishIngredient.createMany({
				data: dto.ingredients.map((item) => ({
					idDish: id,
					idProduct: item.productId,
					count: item.quantity
				}))
			})
			await refreshAutoStops(tx, { id })
			return this.saved(tx, id)
		})
	}
	async trash(id: string, version: number) {
		return inventoryTransaction(this.prisma, async (tx) => {
			await this.advance(tx, id, version, false, { deletedAt: new Date() })
			await tx.stopList.deleteMany({ where: { idDish: id, type: 'AUTO' } })
			return this.saved(tx, id)
		})
	}
	async restore(id: string, version: number) {
		return inventoryTransaction(this.prisma, async (tx) => {
			await this.advance(tx, id, version, true, { deletedAt: null })
			await refreshAutoStops(tx, { id })
			return this.saved(tx, id)
		})
	}
	private async advance(
		tx: Prisma.TransactionClient,
		id: string,
		version: number,
		trashed: boolean,
		data: Prisma.DishUpdateManyMutationInput
	) {
		const result = await tx.dish.updateMany({
			where: { id, version, deletedAt: trashed ? { not: null } : null },
			data: { ...data, version: { increment: 1 } }
		})
		if (result.count) return
		if (!(await tx.dish.findUnique({ where: { id } })))
			throw new NotFoundException('Блюдо не найдено')
		throw new ConflictException({
			code: 'DISH_CONFLICT',
			message:
				'Блюдо уже изменено или перемещено в корзину. Загрузите свежую версию; ваши изменения не сохранены'
		})
	}
	private async checkIngredients(
		tx: Prisma.TransactionClient,
		dto: DishInputDto
	) {
		const ids = dto.ingredients.map((item) => item.productId).sort()
		await tx.$queryRaw`SELECT id_product FROM products WHERE id_product IN (${Prisma.join(ids)}) ORDER BY id_product FOR UPDATE`
		const products = await tx.product.findMany({
			where: { id: { in: ids } },
			select: { id: true, idUnit: true }
		})
		if (products.length !== ids.length)
			throw new BadRequestException(
				'Один из продуктов не существует. Обновите справочник'
			)
		for (const item of dto.ingredients) {
			if (new Prisma.Decimal(item.quantity).lte(0))
				throw new BadRequestException(
					'Количество ингредиента должно быть больше нуля'
				)
			if (
				products.find((product) => product.id === item.productId)!.idUnit !==
				item.unitId
			)
				throw new ConflictException(
					'Единица продукта изменилась. Выберите продукт заново'
				)
		}
	}
	private async saved(tx: Prisma.TransactionClient, id: string) {
		const dish = await tx.dish.findUniqueOrThrow({ where: { id }, select })
		const [{ matches }] = await tx.$queryRaw<
			Array<{ matches: number }>
		>`SELECT count(*)::int AS matches FROM dishes WHERE id_dish <> ${id} AND deleted_at IS NULL AND lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g')) = lower(${dish.name})`
		return {
			dish: this.present(dish, await availableStock(tx)),
			warnings:
				!dish.deletedAt && matches
					? ['Блюдо с таким названием уже есть. Сохранена отдельная запись.']
					: []
		}
	}
	private present(dish: Dish, stock: Map<string, Prisma.Decimal>) {
		const portions = countPortions(dish.ingredients, stock)
		return {
			id: dish.id,
			name: dish.name,
			version: dish.version,
			deletedAt: dish.deletedAt,
			portions,
			autoStop: !dish.deletedAt && portions === 0,
			manualStop: dish.stopLists.some((stop) => stop.type === 'MANUAL'),
			ingredients: dish.ingredients.map((item) => ({
				productId: item.idProduct,
				name: item.product.nameProduct,
				unit: item.product.unit,
				quantity: item.count.toFixed(3),
				availableQuantity: (
					stock.get(item.idProduct) ?? new Prisma.Decimal(0)
				).toFixed(3),
				missing: (stock.get(item.idProduct) ?? new Prisma.Decimal(0)).lt(
					item.count
				)
			}))
		}
	}
}
