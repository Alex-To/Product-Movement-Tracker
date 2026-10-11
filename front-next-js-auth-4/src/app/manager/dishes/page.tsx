export const metadata = { title: 'Блюда и рецептуры · Менеджер' }
export default function Page() {
	return (
		<div className="rounded-lg border border-border bg-surface-raised p-8 text-center">
			<h2>Открыть рецепт</h2>
			<p className="mt-4 text-ink-muted">
				Выберите блюдо в списке слева или нажмите «Новое блюдо».
			</p>
		</div>
	)
}
