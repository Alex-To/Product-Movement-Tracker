import userService from '@/services/user.service'
import { transformUserToState } from '@/utils/transform-user-to-state'
import { useQuery } from '@tanstack/react-query'

export function useProfile() {
	const { data, isLoading, refetch } = useQuery({
		queryKey: ['profile'],
		queryFn: ({ signal }) => userService.fetchProfile(signal),
		retry: false,
		gcTime: 0,
		staleTime: 0,
		refetchOnMount: 'always',
		refetchInterval: 1800000
	})

	const profile = data?.data

	const userState = profile ? transformUserToState(profile) : null

	return {
		isLoading,
		refetch,
		user: {
			...profile,
			...userState
		}
	}
}
