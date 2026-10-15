import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Response } from 'express'

@Injectable()
export class RefreshTokenService {
	constructor(private readonly config: ConfigService) {}
	private get cookieOptions() {
		return {
			httpOnly: true,
			path: '/',
			sameSite: 'lax' as const,
			secure:
				this.config.get('COOKIE_SECURE') === 'true' ||
				(this.config.get('NODE_ENV') === 'production' &&
					this.config.get('COOKIE_SECURE') !== 'false')
		}
	}
	readonly EXPIRE_DAY_REFRESH_TOKEN = 1
	readonly REFRESH_TOKEN_NAME = 'refreshToken'

	addRefreshTokenToResponse(res: Response, refreshToken: string) {
		const expiresIn = new Date()
		expiresIn.setDate(expiresIn.getDate() + this.EXPIRE_DAY_REFRESH_TOKEN)

		res.cookie(this.REFRESH_TOKEN_NAME, refreshToken, {
			...this.cookieOptions,
			expires: expiresIn
		})
	}

	removeRefreshTokenFromResponse(res: Response) {
		res.cookie(this.REFRESH_TOKEN_NAME, '', {
			...this.cookieOptions,
			expires: new Date(0)
		})
	}
}
