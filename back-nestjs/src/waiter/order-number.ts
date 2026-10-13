// Номер заказа для кухни: сквозной круг 1…99. Записывается в заказ один раз,
// при создании; отклонённые заказы номер не получают
export const ORDER_NUMBER_CYCLE = 99

export function nextOrderNumber(last: number | null) {
	return last ? (last % ORDER_NUMBER_CYCLE) + 1 : 1
}
