import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import {
	randomBytes,
	randomUUID,
	createHash,
	timingSafeEqual
} from 'node:crypto'
import { KeyEncryptionService } from './key-encryption.service'
import { PrismaService } from '../prisma.service'
import { inventoryTransaction } from '../inventory/availability'
import { writeReceipt } from '../deliveries/receipt-writer'
import { keyHash } from './api-key.guard'
import {
	DecisionDto,
	ExternalQueryDto,
	ExternalSubmissionDto
} from './external.dto'

const hash = (value: unknown) =>
	createHash('sha256').update(JSON.stringify(value)).digest('hex')
const sourceFields = {
	id: true,
	name: true,
	prefix: true,
	createdAt: true,
	revokedAt: true
} as const
const requestFields = {
	id: true,
	interfaceId: true,
	interface: { select: { id: true, name: true } },
	supplierId: true,
	supplierNameAtSubmission: true,
	number: true,
	status: true,
	submittedAt: true,
	reviewedAt: true,
	reviewedBy: { select: { id: true, name: true } },
	comment: true,
	deliveryId: true,
	lines: {
		orderBy: { position: 'asc' as const },
		select: {
			id: true,
			position: true,
			productId: true,
			quantity: true,
			expiresAt: true,
			unitIdAtSubmission: true,
			productNameAtSubmission: true,
			unitNameAtSubmission: true,
			acceptedQuantity: true,
			status: true,
			batchId: true
		}
	}
} satisfies Prisma.ExternalDeliveryRequestSelect

@Injectable()
export class ExternalService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly encryption: KeyEncryptionService
	) {}
	async createInterface(userId: string, name: string) {
		const prefix = 'eif_' + randomBytes(6).toString('hex')
		const key = prefix + '_' + randomBytes(32).toString('hex')
		const source = await this.prisma.externalInterface.create({
			data: {
				name,
				prefix,
				keyHash: keyHash(key),
				encryptedKey: this.encryption.encrypt(key, prefix),
				createdById: userId
			},
			select: sourceFields
		})
		return { ...source, key }
	}
	async readKey(id: string) {
		const source = await this.prisma.externalInterface.findUnique({
			where: { id },
			select: { id: true, name: true, prefix: true, encryptedKey: true }
		})
		if (!source) throw new NotFoundException('Интерфейс не найден')
		return {
			id: source.id,
			name: source.name,
			key: source.encryptedKey
				? this.encryption.decrypt(source.encryptedKey, source.prefix)
				: null
		}
	}
	async rememberKey(id: string, key: string) {
		const source = await this.prisma.externalInterface.findUnique({
			where: { id },
			select: { id: true, keyHash: true, prefix: true }
		})
		if (!source) throw new NotFoundException('Интерфейс не найден')
		if (
			!timingSafeEqual(
				Buffer.from(source.keyHash, 'hex'),
				Buffer.from(keyHash(key), 'hex')
			)
		)
			throw new BadRequestException(
				'Этот ключ не принадлежит выбранному интерфейсу'
			)
		await this.prisma.externalInterface.update({
			where: { id },
			data: { encryptedKey: this.encryption.encrypt(key, source.prefix) }
		})
		return this.readKey(id)
	}
	async interfaces(query: ExternalQueryDto) {
		const where = {
			name: query.search
				? { contains: query.search, mode: 'insensitive' as const }
				: undefined
		}
		return this.prisma.$transaction(
			async (tx) => ({
				items: await tx.externalInterface.findMany({
					where,
					select: sourceFields,
					orderBy: [
						{ revokedAt: { sort: 'asc', nulls: 'first' } },
						{ createdAt: 'desc' },
						{ id: 'desc' }
					],
					skip: (query.page - 1) * 25,
					take: 25
				}),
				total: await tx.externalInterface.count({ where }),
				page: query.page,
				pageSize: 25
			}),
			{ isolationLevel: 'RepeatableRead' }
		)
	}
	async revoke(id: string) {
		const source = await this.prisma.externalInterface.findUnique({
			where: { id },
			select: sourceFields
		})
		if (!source) throw new NotFoundException('Интерфейс не найден')
		if (source.revokedAt) return source
		return this.prisma.externalInterface.update({
			where: { id },
			data: { revokedAt: new Date() },
			select: sourceFields
		})
	}
	async restore(id: string) {
		try {
			return await this.prisma.externalInterface.update({
				where: { id },
				data: { revokedAt: null },
				select: sourceFields
			})
		} catch (error) {
			if (
				error instanceof Prisma.PrismaClientKnownRequestError &&
				error.code === 'P2025'
			)
				throw new NotFoundException('Интерфейс не найден')
			throw error
		}
	}
	async products(query: ExternalQueryDto) {
		const where = {
			nameProduct: query.search
				? { contains: query.search, mode: 'insensitive' as const }
				: undefined
		}
		return this.prisma.$transaction(
			async (tx) => ({
				items: await tx.product.findMany({
					where,
					select: {
						id: true,
						nameProduct: true,
						unit: { select: { id: true, name: true } }
					},
					orderBy: [{ nameProduct: 'asc' }, { id: 'asc' }],
					skip: (query.page - 1) * 50,
					take: 50
				}),
				total: await tx.product.count({ where }),
				page: query.page,
				pageSize: 50
			}),
			{ isolationLevel: 'RepeatableRead' }
		)
	}
	async suppliers(query: ExternalQueryDto) {
		const where = {
			name: query.search
				? { contains: query.search, mode: 'insensitive' as const }
				: undefined
		}
		return this.prisma.$transaction(
			async (tx) => ({
				items: await tx.supplier.findMany({
					where,
					select: { id: true, name: true },
					orderBy: [{ name: 'asc' }, { id: 'asc' }],
					skip: (query.page - 1) * 50,
					take: 50
				}),
				total: await tx.supplier.count({ where }),
				page: query.page,
				pageSize: 50
			}),
			{ isolationLevel: 'RepeatableRead' }
		)
	}
	async list(query: ExternalQueryDto, interfaceId?: string) {
		const where: Prisma.ExternalDeliveryRequestWhereInput = {
			interfaceId: interfaceId ?? query.interfaceId,
			supplierId: query.supplierId,
			status: query.status,
			number: query.search
				? { contains: query.search, mode: 'insensitive' }
				: undefined
		}
		return this.prisma.$transaction(
			async (tx) => ({
				items: await tx.externalDeliveryRequest.findMany({
					where,
					select: requestFields,
					orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
					skip: (query.page - 1) * 25,
					take: 25
				}),
				total: await tx.externalDeliveryRequest.count({ where }),
				page: query.page,
				pageSize: 25
			}),
			{ isolationLevel: 'RepeatableRead' }
		)
	}
	async get(id: string, interfaceId?: string) {
		const value = await this.prisma.externalDeliveryRequest.findFirst({
			where: { id, interfaceId },
			select: requestFields
		})
		if (!value) throw new NotFoundException('Заявка не найдена')
		return value
	}
	async submit(interfaceId: string, dto: ExternalSubmissionDto) {
		const lines = dto.lines.map((line) => ({
			productId: line.productId,
			unitId: line.unitId,
			quantity: new Prisma.Decimal(line.quantity).toFixed(3),
			expiresAt: new Date(line.expiresAt).toISOString()
		}))
		const requestHash = hash({
			supplierId: dto.supplierId,
			number: dto.number,
			lines
		})
		const replay = async () => {
			const previous = await this.prisma.externalDeliveryRequest.findUnique({
				where: {
					interfaceId_requestId: { interfaceId, requestId: dto.requestId }
				}
			})
			if (!previous) return null
			if (previous.requestHash !== requestHash)
				throw new ConflictException(
					'requestId уже использован для другой заявки'
				)
			return this.get(previous.id, interfaceId)
		}
		const previous = await replay()
		if (previous) return previous
		try {
			return await inventoryTransaction(this.prisma, async (tx) => {
				// Lock the source, then supplier and products in stable order.
				await tx.$queryRaw`SELECT id_external_interface FROM external_interfaces WHERE id_external_interface=${interfaceId} FOR UPDATE`
				const source = await tx.externalInterface.findUnique({
					where: { id: interfaceId }
				})
				if (!source || source.revokedAt)
					throw new ConflictException('Ключ отозван')
				const supplier = await tx.supplier.findUnique({
					where: { id: dto.supplierId }
				})
				if (!supplier)
					throw new BadRequestException('Выберите существующего поставщика')
				if (
					await tx.delivery.findFirst({
						where: { supplierId: dto.supplierId, number: dto.number },
						select: { id: true }
					})
				)
					throw new ConflictException('Накладная уже проведена')
				const ids = [...new Set(lines.map((line) => line.productId))].sort()
				await tx.$queryRaw`SELECT id_product FROM products WHERE id_product IN (${Prisma.join(ids)}) ORDER BY id_product FOR UPDATE`
				const products = await tx.product.findMany({
					where: { id: { in: ids } },
					include: { unit: true }
				})
				const now = new Date()
				for (const [index, line] of lines.entries()) {
					const product = products.find(
						(product) => product.id === line.productId
					)
					if (!product)
						throw new BadRequestException(
							`Строка ${index + 1}: продукт не найден`
						)
					if (product.idUnit !== line.unitId)
						throw new ConflictException(
							`Строка ${index + 1}: единица продукта изменилась`
						)
					if (new Prisma.Decimal(line.quantity).lte(0))
						throw new BadRequestException(
							`Строка ${index + 1}: количество должно быть больше нуля`
						)
					if (new Date(line.expiresAt) <= now)
						throw new BadRequestException(
							`Строка ${index + 1}: срок годности истёк`
						)
				}
				return tx.externalDeliveryRequest.create({
					data: {
						interfaceId,
						supplierId: supplier.id,
						supplierNameAtSubmission: supplier.name,
						number: dto.number,
						requestId: dto.requestId,
						requestHash,
						lines: {
							create: lines.map((line, position) => {
								const product = products.find((p) => p.id === line.productId)!
								return {
									position,
									productId: product.id,
									quantity: line.quantity,
									expiresAt: new Date(line.expiresAt),
									unitIdAtSubmission: product.idUnit,
									productNameAtSubmission: product.nameProduct,
									unitNameAtSubmission: product.unit.name
								}
							})
						}
					},
					select: requestFields
				})
			})
		} catch (error) {
			if (
				error instanceof Prisma.PrismaClientKnownRequestError &&
				error.code === 'P2002'
			) {
				const value = await replay()
				if (value) return value
				throw new ConflictException(
					'Ожидающая заявка с этой накладной уже существует'
				)
			}
			throw error
		}
	}
	async decide(
		id: string,
		userId: string,
		dto: DecisionDto | null,
		comment?: string
	) {
		const decisionHash = hash(
			dto
				? {
						lines: [...dto.lines]
							.sort((a, b) => a.lineId.localeCompare(b.lineId))
							.map((line) => ({
								lineId: line.lineId,
								quantity: new Prisma.Decimal(line.quantity).toFixed(3)
							})),
						receivedAt: dto.receivedAt
							? new Date(dto.receivedAt).toISOString()
							: null,
						comment: dto.comment?.trim() || null
					}
				: { reject: true, comment: comment?.trim() || null }
		)
		const receiptRequestId = randomUUID()
		try {
			return await inventoryTransaction(this.prisma, async (tx) => {
				await tx.$queryRaw`SELECT id_external_request FROM external_delivery_requests WHERE id_external_request=${id} FOR UPDATE`
				const request = await tx.externalDeliveryRequest.findUnique({
					where: { id },
					include: { lines: { orderBy: { position: 'asc' } } }
				})
				if (!request) throw new NotFoundException('Заявка не найдена')
				if (request.status !== 'PENDING') {
					if (request.decisionHash === decisionHash)
						return tx.externalDeliveryRequest.findUnique({
							where: { id },
							select: requestFields
						})
					throw new ConflictException(
						'Заявка уже обработана. Обновите страницу'
					)
				}
				const accepted = new Map<string, Prisma.Decimal>()
				if (dto) {
					if (
						dto.lines.length !== request.lines.length ||
						new Set(dto.lines.map((line) => line.lineId)).size !==
							request.lines.length
					)
						throw new BadRequestException(
							'Передайте решение по каждой строке заявки ровно один раз'
						)
					for (const line of dto.lines) {
						const original = request.lines.find(
								(row) => row.id === line.lineId
							),
							quantity = new Prisma.Decimal(line.quantity)
						if (!original || quantity.lt(0) || quantity.gt(original.quantity))
							throw new BadRequestException(
								'Принимаемое количество должно быть от нуля до заявленного'
							)
						accepted.set(line.lineId, quantity)
					}
					if (![...accepted.values()].some((q) => q.gt(0)))
						throw new BadRequestException(
							'Для полного отказа используйте отклонение заявки'
						)
				}
				const selected = request.lines.filter((line) =>
					accepted.get(line.id)?.gt(0)
				)
				let deliveryId: string | null = null
				if (dto) {
					const lines = selected.map((line) => ({
						productId: line.productId,
						unitId: line.unitIdAtSubmission,
						quantity: accepted.get(line.id)!.toFixed(3),
						expiresAt: line.expiresAt.toISOString()
					}))
					const delivery = await writeReceipt(
						tx,
						userId,
						{
							requestId: receiptRequestId,
							supplierId: request.supplierId,
							number: request.number,
							receivedAt: dto.receivedAt,
							lines
						},
						lines,
						decisionHash
					)
					deliveryId = delivery.id
					// Match identical accepted lines as a multiset; database return order is not guaranteed.
					const batches = [...delivery.batches]
					for (const line of selected) {
						const index = batches.findIndex(
							(batch) =>
								batch.idProduct === line.productId &&
								batch.EXP.getTime() === line.expiresAt.getTime() &&
								batch.receivedCount!.eq(accepted.get(line.id)!)
						)
						if (index < 0) throw new Error('Не найдена созданная партия')
						await tx.externalDeliveryRequestLine.update({
							where: { id: line.id },
							data: { batchId: batches.splice(index, 1)[0].id }
						})
					}
				}
				for (const line of request.lines) {
					const quantity = accepted.get(line.id) ?? new Prisma.Decimal(0)
					await tx.externalDeliveryRequestLine.update({
						where: { id: line.id },
						data: {
							acceptedQuantity: quantity,
							status: quantity.eq(0)
								? 'REJECTED'
								: quantity.eq(line.quantity)
									? 'ACCEPTED'
									: 'PARTIALLY_ACCEPTED'
						}
					})
				}
				const full = request.lines.every((line) =>
					accepted.get(line.id)?.eq(line.quantity)
				)
				return tx.externalDeliveryRequest.update({
					where: { id },
					data: {
						status: dto
							? full
								? 'ACCEPTED'
								: 'PARTIALLY_ACCEPTED'
							: 'REJECTED',
						reviewedAt: new Date(),
						reviewedById: userId,
						comment: (dto?.comment ?? comment)?.trim() || null,
						decisionHash,
						deliveryId
					},
					select: requestFields
				})
			})
		} catch (error) {
			if (
				error instanceof Prisma.PrismaClientKnownRequestError &&
				error.code === 'P2002'
			)
				throw new ConflictException(
					'Накладная с таким номером у этого поставщика уже проведена'
				)
			throw error
		}
	}
}
