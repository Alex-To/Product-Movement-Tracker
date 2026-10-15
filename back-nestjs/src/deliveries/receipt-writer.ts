import { BadRequestException, ConflictException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { refreshAutoStops } from '../inventory/availability'
interface ReceiptLine {
	productId: string
	unitId: string
	quantity: string
	expiresAt: string
}
interface ReceiptInput {
	requestId: string
	supplierId: string
	number: string
	receivedAt?: string
	lines: ReceiptLine[]
}
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

export async function writeReceipt(
	tx: Prisma.TransactionClient,
	userId: string,
	dto: ReceiptInput,
	lines: ReceiptLine[],
	hash: string
) {
	if (!(await tx.supplier.findUnique({ where: { id: dto.supplierId } })))
		throw new BadRequestException('Выберите существующего поставщика')
	// Lock in a stable order; product edits/deletes must wait until batches are recorded.
	const ids = [...new Set(lines.map((line) => line.productId))].sort()
	await tx.$queryRaw`SELECT id_product FROM products WHERE id_product IN (${Prisma.join(ids)}) ORDER BY id_product FOR UPDATE`
	const products = await tx.product.findMany({
		where: { id: { in: ids } },
		select: {
			id: true,
			nameProduct: true,
			unit: { select: { id: true, name: true } }
		}
	})
	if (products.length !== ids.length)
		throw new BadRequestException(
			'Один из продуктов больше не существует. Обновите справочник'
		)
	const now = new Date()
	const receivedAt = dto.receivedAt ? new Date(dto.receivedAt) : now
	if (receivedAt > now)
		throw new BadRequestException('Дата приёма не может быть в будущем')
	lines.forEach((line, index) => {
		if (
			products.find((product) => product.id === line.productId)!.unit.id !==
			line.unitId
		)
			throw new ConflictException(
				`Строка ${index + 1}: единица продукта изменилась. Найдите продукт заново и замените строку`
			)
		if (new Prisma.Decimal(line.quantity).lte(0))
			throw new BadRequestException(
				`Строка ${index + 1}: количество должно быть больше нуля`
			)
		if (new Date(line.expiresAt) <= now)
			throw new BadRequestException(
				`Строка ${index + 1}: срок годности уже истёк`
			)
	})
	const delivery = await tx.delivery.create({
		data: {
			number: dto.number,
			supplierId: dto.supplierId,
			createrId: userId,
			createDate: receivedAt,
			requestId: dto.requestId,
			requestHash: hash,
			batches: {
				create: lines.map((line) => {
					const product = products.find(
						(product) => product.id === line.productId
					)!
					return {
						idProduct: line.productId,
						count: line.quantity,
						receivedCount: line.quantity,
						EXP: new Date(line.expiresAt),
						productNameAtReceipt: product.nameProduct,
						unitNameAtReceipt: product.unit.name
					}
				})
			}
		},
		select: detail
	})
	await refreshAutoStops(
		tx,
		{ ingredients: { some: { idProduct: { in: ids } } } },
		now
	)
	return delivery
}
