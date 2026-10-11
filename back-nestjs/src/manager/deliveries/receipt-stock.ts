import { Prisma } from '@prisma/client'
import { refreshAutoStops } from '../../inventory/availability'

// Compatibility adapter: the implementation lives in the neutral inventory module.
export function refreshReceiptAutoStops(
	tx: Prisma.TransactionClient,
	productIds: string[],
	asOf: Date
) {
	return refreshAutoStops(
		tx,
		{ ingredients: { some: { idProduct: { in: productIds } } } },
		asOf
	)
}
