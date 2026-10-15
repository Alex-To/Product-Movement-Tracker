import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { createHash } from 'node:crypto'
import { PrismaService } from '../../prisma.service'
import { writeReceipt } from '../../deliveries/receipt-writer'
import {
	DeliveriesQueryDto,
	DeliveryInputDto,
	SupplierInputDto
} from './deliveries.dto'

const summary = {
	id: true,
	number: true,
	createDate: true,
	supplier: { select: { id: true, name: true } },
	creater: { select: { id: true, name: true } },
	_count: { select: { batches: true } }
} satisfies Prisma.DeliverySelect
const detail = {
	...summary,
	batches: {
		orderBy: { id: 'asc' as const },
		select: {
			id: true,
			idProduct: true,
			count: true,
			receivedCount: true,
			EXP: true,
			productNameAtReceipt: true,
			unitNameAtReceipt: true,
			product: {
				select: { nameProduct: true, unit: { select: { name: true } } }
			}
		}
	}
} satisfies Prisma.DeliverySelect

@Injectable()
export class ManagerDeliveriesService {
	constructor(private readonly prisma: PrismaService) {}

	getSuppliers() {
		return this.prisma.supplier.findMany({
			select: { id: true, name: true },
			orderBy: [{ name: 'asc' }, { id: 'asc' }]
		})
	}

	async createSupplier(dto: SupplierInputDto) {
		try {
			return await this.prisma.supplier.create({
				data: { name: dto.name, nameKey: dto.name.toLowerCase() },
				select: { id: true, name: true }
			})
		} catch (error) {
			if (this.hasCode(error, 'P2002'))
				throw new ConflictException('Поставщик с таким названием уже есть')
			throw error
		}
	}

	async list(query: DeliveriesQueryDto) {
		const where: Prisma.DeliveryWhereInput = query.search
			? {
					OR: [
						{ number: { contains: query.search, mode: 'insensitive' } },
						{
							supplier: {
								name: { contains: query.search, mode: 'insensitive' }
							}
						}
					]
				}
			: {}
		return this.prisma.$transaction(
			async (tx) => ({
				items: await tx.delivery.findMany({
					where,
					select: summary,
					orderBy: [{ createDate: 'desc' }, { id: 'desc' }],
					skip: (query.page - 1) * 25,
					take: 25
				}),
				total: await tx.delivery.count({ where }),
				page: query.page,
				pageSize: 25
			}),
			{ isolationLevel: 'RepeatableRead' }
		)
	}

	async get(id: string) {
		const delivery = await this.prisma.delivery.findUnique({
			where: { id },
			select: detail
		})
		if (!delivery) throw new NotFoundException('Поставка не найдена')
		return delivery
	}

	async receive(userId: string, dto: DeliveryInputDto) {
		const lines = dto.lines.map((line) => ({
			productId: line.productId,
			unitId: line.unitId,
			quantity: new Prisma.Decimal(line.quantity).toFixed(3),
			expiresAt: new Date(line.expiresAt).toISOString()
		}))
		const hash = createHash('sha256')
			.update(
				JSON.stringify({
					userId,
					supplierId: dto.supplierId,
					number: dto.number,
					receivedAt: dto.receivedAt
						? new Date(dto.receivedAt).toISOString()
						: null,
					lines
				})
			)
			.digest('hex')
		const replay = async () => {
			const previous = await this.prisma.delivery.findUnique({
				where: { requestId: dto.requestId },
				select: { id: true, requestHash: true }
			})
			if (!previous) return null
			if (previous.requestHash !== hash)
				throw new ConflictException(
					'Этот идентификатор подтверждения уже использован для другой поставки'
				)
			return this.get(previous.id)
		}
		const previous = await replay()
		if (previous) return previous
		for (let attempt = 0; attempt < 3; attempt++) {
			try {
				return await this.prisma.$transaction(
					async (tx) => {
						return writeReceipt(tx, userId, dto, lines, hash)
					},
					{ isolationLevel: 'Serializable' }
				)
			} catch (error) {
				const retryable =
					this.hasCode(error, 'P2034') ||
					(this.hasCode(error, 'P2010') &&
						['40001', '40P01'].includes(
							String((error as Prisma.PrismaClientKnownRequestError).meta?.code)
						))
				if (retryable && attempt < 2) continue
				if (retryable)
					throw new ConflictException(
						'Склад изменился одновременно с приёмкой. Повторите подтверждение'
					)
				if (this.hasCode(error, 'P2002')) {
					const previous = await replay()
					if (previous) return previous
					throw new ConflictException(
						'Накладная с таким номером у этого поставщика уже проведена'
					)
				}
				if (this.hasCode(error, 'P2003'))
					throw new ConflictException(
						'Справочник изменился. Проверьте поставщика и продукты'
					)
				throw error
			}
		}
	}

	private hasCode(error: unknown, code: string) {
		return (
			error instanceof Prisma.PrismaClientKnownRequestError &&
			error.code === code
		)
	}
}
