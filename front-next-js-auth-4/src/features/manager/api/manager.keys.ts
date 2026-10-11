export const managerKeys = {
	session: ['manager', 'session'] as const,
	catalog: ['manager', 'catalog'] as const,
	units: (userId: string) => ['manager', 'catalog', userId, 'units'] as const,
	products: (userId: string, filters: object) => ['manager', 'catalog', userId, 'products', filters] as const,
	name: (userId: string, name: string, excludeId?: string) => ['manager', 'catalog', userId, 'name', name, excludeId] as const
}
