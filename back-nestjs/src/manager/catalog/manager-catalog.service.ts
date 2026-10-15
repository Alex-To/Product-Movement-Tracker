import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma.service'
import { availableStock } from '../../inventory/availability'
import { ProductInputDto, ProductsQueryDto, UnitInputDto } from './dto/catalog.dto'

const PRODUCT_SELECT = {
	id: true,
	nameProduct: true,
	unit: { select: { id: true, name: true } },
	_count: { select: { batches: true, dishIngredients: true, externalRequestLines: true } }
} satisfies Prisma.ProductSelect

type CatalogProduct = Prisma.ProductGetPayload<{ select: typeof PRODUCT_SELECT }>

@Injectable()
export class ManagerCatalogService {
	constructor(private readonly prisma: PrismaService) {}

	async getUnits() {
		const units = await this.prisma.unit.findMany({
			orderBy: [{ name: 'asc' }, { id: 'asc' }],
			select: { id: true, name: true, _count: { select: { products: true } } }
		})
		return units.map(unit => ({
			id: unit.id,
			name: unit.name,
			productsCount: unit._count.products,
			canDelete: unit._count.products === 0
		}))
	}

	async createUnit(dto: UnitInputDto) {
		// SERIALIZABLE prevents case/whitespace variants racing without a schema change.
		for (let attempt = 0; attempt < 3; attempt++) {
			try {
				return await this.prisma.$transaction(async tx => {
					const duplicates = await tx.$queryRaw<Array<{ id: string }>>`
						SELECT id_unit AS id FROM units
						WHERE lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g')) = lower(${dto.name})
					`
					if (duplicates.length) {
						throw new ConflictException({ code: 'UNIT_EXISTS', message: 'Такая единица уже есть в справочнике' })
					}
					const unit = await tx.unit.create({ data: { name: dto.name } })
					return { ...unit, productsCount: 0, canDelete: true }
				}, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
			} catch (error) {
				if (this.isPrismaError(error, 'P2034') && attempt < 2) continue
				if (this.isPrismaError(error, 'P2002')) {
					throw new ConflictException({ code: 'UNIT_EXISTS', message: 'Такая единица уже есть в справочнике' })
				}
				if (this.isPrismaError(error, 'P2034')) {
					throw new ConflictException({ code: 'RETRY_OPERATION', message: 'Справочник изменился. Повторите добавление' })
				}
				throw error
			}
		}
	}

	async deleteUnit(id: string) {
		try {
			await this.prisma.$transaction(async tx => {
				await tx.$queryRaw`SELECT id_unit FROM units WHERE id_unit = ${id} FOR UPDATE`
				const unit = await tx.unit.findUnique({ where: { id }, select: { _count: { select: { products: true } } } })
				if (!unit) throw new NotFoundException('Единица не найдена')
				if (unit._count.products) {
					throw new ConflictException({ code: 'UNIT_IN_USE', message: 'Единица используется в продуктах и не может быть удалена' })
				}
				await tx.unit.delete({ where: { id } })
			})
		} catch (error) {
			if (this.isPrismaError(error, 'P2025')) throw new NotFoundException('Единица не найдена')
			if (this.isPrismaError(error, 'P2003')) {
				throw new ConflictException({ code: 'UNIT_IN_USE', message: 'Единица используется в продуктах и не может быть удалена' })
			}
			throw error
		}
	}

	async getProducts(query: ProductsQueryDto) {
		const where: Prisma.ProductWhereInput = {
			...(query.unitId ? { idUnit: query.unitId } : {}),
			...(query.search ? { AND: query.search.split(' ').filter(Boolean).map(word => ({
				nameProduct: { contains: word, mode: Prisma.QueryMode.insensitive }
			})) } : {})
		}
		return this.prisma.$transaction(async tx => {
			const asOf = new Date()
			const total = await tx.product.count({ where })
			const products = await tx.product.findMany({
				where,
				select: PRODUCT_SELECT,
				orderBy: [{ nameProduct: 'asc' }, { id: 'asc' }],
				skip: (query.page - 1) * query.pageSize,
				take: query.pageSize
			})
			const amounts = await availableStock(tx, asOf, products.map(product => product.id))
			return {
				items: products.map(product => ({
					...this.presentProduct(product),
					availableQuantity: (amounts.get(product.id) ?? new Prisma.Decimal(0)).toFixed(3)
				})),
				total, page: query.page, pageSize: query.pageSize, generatedAt: asOf.toISOString()
			}
		}, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
	}

	async checkName(name: string, excludeId = '') {
		return this.duplicateNames(this.prisma, name, excludeId)
	}

	async createProduct(dto: ProductInputDto) {
		try {
			return await this.prisma.$transaction(async tx => {
				await this.requireUnit(tx, dto.unitId)
				const product = await tx.product.create({
					data: { nameProduct: dto.name, idUnit: dto.unitId }, select: PRODUCT_SELECT
				})
				return this.savedProduct(tx, product)
			})
		} catch (error) {
			if (this.isPrismaError(error, 'P2003')) throw new BadRequestException('Единица больше не существует. Обновите справочник')
			throw error
		}
	}

	async updateProduct(id: string, dto: ProductInputDto) {
		try {
			return await this.prisma.$transaction(async tx => {
				// FOR UPDATE also conflicts with FK inserts from deliveries/recipes.
				// Check references after taking the lock so a unit cannot change mid-insert.
				await tx.$queryRaw`SELECT id_product FROM products WHERE id_product = ${id} FOR UPDATE`
				const current = await tx.product.findUnique({ where: { id }, select: PRODUCT_SELECT })
				if (!current) throw new NotFoundException('Продукт не найден')
				if (current.unit.id !== dto.unitId && (current._count.batches || current._count.dishIngredients || current._count.externalRequestLines)) {
					throw new ConflictException({ code: 'PRODUCT_UNIT_LOCKED', message: 'Нельзя менять единицу: у продукта уже есть партии, рецепты или внешние заявки' })
				}
				await this.requireUnit(tx, dto.unitId)
				const product = await tx.product.update({
					where: { id }, data: { nameProduct: dto.name, idUnit: dto.unitId }, select: PRODUCT_SELECT
				})
				return this.savedProduct(tx, product)
			})
		} catch (error) {
			if (this.isPrismaError(error, 'P2003')) throw new BadRequestException('Единица больше не существует. Обновите справочник')
			throw error
		}
	}

	async deleteProduct(id: string) {
		try {
			await this.prisma.$transaction(async tx => {
				await tx.$queryRaw`SELECT id_product FROM products WHERE id_product = ${id} FOR UPDATE`
				const product = await tx.product.findUnique({ where: { id }, select: PRODUCT_SELECT })
				if (!product) throw new NotFoundException('Продукт не найден')
				if (product._count.batches || product._count.dishIngredients || product._count.externalRequestLines) {
					throw new ConflictException({ code: 'PRODUCT_IN_USE', message: 'Нельзя удалить продукт: у него есть партии, рецепты или внешние заявки' })
				}
				await tx.product.delete({ where: { id } })
			})
		} catch (error) {
			if (this.isPrismaError(error, 'P2025')) throw new NotFoundException('Продукт не найден')
			if (this.isPrismaError(error, 'P2003')) {
				throw new ConflictException({ code: 'PRODUCT_IN_USE', message: 'Нельзя удалить продукт: у него есть партии, рецепты или внешние заявки' })
			}
			throw error
		}
	}

	private async requireUnit(tx: Prisma.TransactionClient, id: string) {
		if (!await tx.unit.findUnique({ where: { id }, select: { id: true } })) {
			throw new BadRequestException({ code: 'UNIT_NOT_FOUND', message: 'Выберите существующую единицу измерения' })
		}
	}

	private presentProduct(product: CatalogProduct) {
		const inUse = product._count.batches > 0 || product._count.dishIngredients > 0 || product._count.externalRequestLines > 0
		return {
			id: product.id, name: product.nameProduct, unit: product.unit,
			batchesCount: product._count.batches, dishesCount: product._count.dishIngredients,
			canDelete: !inUse, canChangeUnit: !inUse
		}
	}

	private async duplicateNames(tx: Prisma.TransactionClient, name: string, excludeId: string) {
		if (!name) return { matches: 0 }
		const [row] = await tx.$queryRaw<Array<{ matches: number }>>`
			SELECT count(*)::int AS matches FROM products
			WHERE lower(regexp_replace(btrim(name_product), '[[:space:]]+', ' ', 'g')) = lower(${name})
			AND id_product <> ${excludeId}
		`
		return { matches: row.matches }
	}

	private async savedProduct(tx: Prisma.TransactionClient, product: CatalogProduct) {
		const { matches } = await this.duplicateNames(tx, product.nameProduct, product.id)
		return {
			product: this.presentProduct(product),
			warnings: matches ? ['Продукт с таким названием уже есть. Сохранена отдельная запись.'] : []
		}
	}

	private isPrismaError(error: unknown, code: string) {
		return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
	}
}
