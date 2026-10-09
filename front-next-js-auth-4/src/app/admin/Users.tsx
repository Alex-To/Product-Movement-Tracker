'use client'

import UserService from '@/services/user.service'
import { useQuery } from '@tanstack/react-query'

export function Users() {
	const { data, isLoading } = useQuery({
		queryKey: ['users'],
		queryFn: () => UserService.fetchList()
	})

	return (
		<div>
			<h1>Сотрудники</h1>
			{isLoading ? (
				<div>Loading...</div>
			) : data?.data?.length ? (
				data.data.map(user => (
					<div key={user.id}>
						{user.name} ({user.login}) — {user.role}
					</div>
				))
			) : (
				<p>Not found!</p>
			)}
		</div>
	)
}
