import { HttpException, UnauthorizedException } from '@nestjs/common'
import { ExternalApiKeyGuard } from './api-key.guard'

describe('external API authentication', () => {
	it('rejects malformed keys before accessing the database and limits invalid attempts', async () => {
		const findUnique = jest.fn()
		const guard = new ExternalApiKeyGuard({
			externalInterface: { findUnique }
		} as any)
		const context = {
			switchToHttp: () => ({
				getRequest: () => ({
					ip: '127.0.0.1',
					headers: { 'x-api-key': 'invalid' }
				})
			})
		} as any
		for (let i = 0; i < 180; i++)
			await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
				UnauthorizedException
			)
		await expect(guard.canActivate(context)).rejects.toMatchObject({
			status: 429
		})
		expect(findUnique).not.toHaveBeenCalled()
	})
	it('limits a valid interface separately from its callers addresses', async () => {
		const guard = new ExternalApiKeyGuard({
			externalInterface: {
				findUnique: jest
					.fn()
					.mockResolvedValue({ id: 'source', revokedAt: null })
			}
		} as any)
		for (let i = 0; i < 121; i++) {
			const req = {
				ip: 'address-' + i,
				headers: { 'x-api-key': 'eif_' + 'a'.repeat(12) + '_' + 'b'.repeat(64) }
			}
			const context = { switchToHttp: () => ({ getRequest: () => req }) } as any
			if (i < 120) expect(await guard.canActivate(context)).toBe(true)
			else
				await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
					HttpException
				)
		}
	})
})
