import { AuthPageWrapper } from './AuthPageWrapper'
import { AuthForm } from './form/AuthForm'

export function AuthPage() {
	return (
		<AuthPageWrapper heading="Вход">
			<AuthForm />
		</AuthPageWrapper>
	)
}
