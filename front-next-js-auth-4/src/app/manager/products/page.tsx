import { ProductsWorkspace } from '@/features/manager/products/ProductsWorkspace'
import { Loading } from '@/components/ui/PizzaLoader'
import type { Metadata } from 'next'
import { Suspense } from 'react'

export const metadata: Metadata = { title: 'Продукты · Менеджер' }

export default function ProductsPage() {
	return <Suspense fallback={<Loading size={96} label="Загрузка справочника…" className="py-24" />}><ProductsWorkspace /></Suspense>
}
