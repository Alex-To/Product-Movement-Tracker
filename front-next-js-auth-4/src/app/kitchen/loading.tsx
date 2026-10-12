import { Loading } from '@/components/ui/PizzaLoader'

// Шапка кабинета остаётся, пицца крутится на месте содержимого
export default function SectionLoading() {
	return <Loading size={96} className="py-24" />
}
