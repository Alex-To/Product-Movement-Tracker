import { ConfigService } from '@nestjs/config'
import { Response } from 'express'
import { RefreshTokenService } from './refresh-token.service'

describe('host-only refresh cookies', () => {
	it.each([
		[{ NODE_ENV: 'production' }, true],
		[{ NODE_ENV: 'production', COOKIE_SECURE: 'false' }, false],
		[{ NODE_ENV: 'development' }, false],
		[{ NODE_ENV: 'development', COOKIE_SECURE: 'true' }, true]
	])(
		'uses the configured transport for creation and removal: %j',
		(values, secure) => {
			const config = {
				get: (name: string) => values[name]
			} as unknown as ConfigService
			const service = new RefreshTokenService(config),
				cookie = jest.fn()
			const response = { cookie } as unknown as Response
			service.addRefreshTokenToResponse(response, 'test-refresh')
			service.removeRefreshTokenFromResponse(response)
			for (const call of cookie.mock.calls) {
				expect(call[2]).toMatchObject({
					httpOnly: true,
					path: '/',
					sameSite: 'lax',
					secure
				})
				expect(call[2]).not.toHaveProperty('domain')
			}
		}
	)
})
