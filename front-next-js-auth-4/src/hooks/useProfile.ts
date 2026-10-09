import authService from '@/services/auth/auth.service'
import userService from '@/services/user.service'
import { transformUserToState } from '@/utils/transform-user-to-state'
import { useQuery } from '@tanstack/react-query'

export function useProfile() {
	const { data, isLoading } = useQuery({
		queryKey: ['profile'],
		queryFn: () => userService.fetchProfile(),
		refetchInterval: 1800000 // 30 minutes
	})

	const {
		isSuccess,
		data: dataTokens,
		refetch
	} = useQuery({
		queryKey: ['new tokens'],
		queryFn: () => authService.getNewTokens(),
		enabled: !data?.data
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
