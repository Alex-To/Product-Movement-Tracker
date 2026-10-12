import { Loading } from '@/components/ui/PizzaLoader'

// Пока грузится страница — пицца на весь экран
export default function RootLoading() {
	return <Loading size={96} className="min-h-screen" />
}
