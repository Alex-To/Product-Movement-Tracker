import { ProductsWorkspace } from '@/features/manager/products/ProductsWorkspace'
import type { Metadata } from 'next'
import { Suspense } from 'react'

export const metadata: Metadata = { title: 'Продукты · Менеджер' }

export default function ProductsPage() {
	return <Suspense fallback={<p role="status">Загрузка справочника…</p>}><ProductsWorkspace /></Suspense>
}
