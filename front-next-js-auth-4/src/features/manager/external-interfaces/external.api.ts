import { instance } from '@/api/axios'

export type RequestStatus =
	'PENDING' | 'ACCEPTED' | 'PARTIALLY_ACCEPTED' | 'REJECTED'
export interface ExternalInterface {
	id: string
	name: string
	prefix: string
	createdAt: string
	revokedAt: string | null
}
export interface RequestLine {
	id: string
	productId: string
	quantity: string
	expiresAt: string
	productNameAtSubmission: string
	unitNameAtSubmission: string
	acceptedQuantity: string | null
	status: RequestStatus
	batchId: string | null
}
export interface ExternalRequest {
	id: string
	interface: { id: string; name: string }
	supplierNameAtSubmission: string
	number: string
	status: RequestStatus
	submittedAt: string
	reviewedAt: string | null
	reviewedBy: { id: string; name: string } | null
	comment: string | null
	deliveryId: string | null
	lines: RequestLine[]
}
export interface Decision {
	lines: { lineId: string; quantity: string }[]
	receivedAt?: string
	comment?: string
}
export interface Page<T> {
	items: T[]
	total: number
	page: number
	pageSize: number
}
const root = '/manager/external-interfaces'
export interface InterfaceSecret {
	id: string
	name: string
	key: string | null
}
export const externalApi = {
	readKey: async (id: string, signal: AbortSignal) =>
		(await instance.get<InterfaceSecret>(`${root}/${id}/key`, { signal })).data,
	rememberKey: async (id: string, key: string) =>
		(await instance.post<InterfaceSecret>(`${root}/${id}/key`, { key })).data,
	interfaces: async (page: number) =>
		(await instance.get<Page<ExternalInterface>>(root, { params: { page } }))
			.data,
	create: async (name: string) =>
		(await instance.post<ExternalInterface & { key: string }>(root, { name }))
			.data,
	revoke: async (id: string) =>
		(await instance.delete<ExternalInterface>(`${root}/${id}`)).data,
	restore: async (id: string) =>
		(await instance.post<ExternalInterface>(`${root}/${id}/restore`)).data,
	requests: async (filters: { page: number; status: string; search: string }) =>
		(
			await instance.get<Page<ExternalRequest>>(`${root}/requests`, {
				params: {
					...filters,
					status: filters.status || undefined,
					search: filters.search || undefined
				}
			})
		).data,
	request: async (id: string) =>
		(await instance.get<ExternalRequest>(`${root}/requests/${id}`)).data,
	accept: async (id: string, decision: Decision) =>
		(
			await instance.post<ExternalRequest>(
				`${root}/requests/${id}/accept`,
				decision
			)
		).data,
	reject: async (id: string, comment: string) =>
		(
			await instance.post<ExternalRequest>(`${root}/requests/${id}/reject`, {
				comment
			})
		).data
}
export const requestStatus: Record<RequestStatus, string> = {
	PENDING: 'Ожидает решения',
	ACCEPTED: 'Принята',
	PARTIALLY_ACCEPTED: 'Принята частично',
	REJECTED: 'Отклонена'
}
