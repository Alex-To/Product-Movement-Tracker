import { DeliveryDetailPage } from '@/features/manager/deliveries/DeliveryDetail'
export const metadata = { title: 'Накладная · Менеджер' }
export default async function Page({
	params
}: {
	params: Promise<{ id: string }>
}) {
	const { id } = await params
	return <DeliveryDetailPage id={id} />
}
