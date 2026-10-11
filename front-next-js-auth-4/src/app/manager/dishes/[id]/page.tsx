import { DishEditorPage } from '@/features/manager/dishes/DishEditor'
export const metadata = { title: 'Рецепт · Менеджер' }
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <DishEditorPage id={id} /> }
