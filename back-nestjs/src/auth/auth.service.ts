import { UserService } from '@/user/user.service'
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Role, type User } from '@prisma/client'
import { verify } from 'argon2'
import { omit } from 'lodash'
import { AuthDto } from './dto/auth.dto'
import { ITokenPayload, TokenType } from './token.types'

@Injectable()
export class AuthService {
	constructor(
		private jwt: JwtService,
		private userService: UserService
	) {}

	private readonly TOKEN_EXPIRATION_ACCESS = '1h'
	private readonly TOKEN_EXPIRATION_REFRESH = '7d'

	async login(dto: AuthDto) {
		const user = await this.validateUser(dto)
		return this.buildResponseObject(user)
	}

	async getNewTokens(refreshToken: string) {
		// Истёкший или битый токен — 401, а не 500 из необработанной ошибки jwt
		const result = await this.jwt
			.verifyAsync<ITokenPayload>(refreshToken)
			.catch(() => null)
		if (!result || result.type !== TokenType.REFRESH) {
			throw new UnauthorizedException('Invalid refresh token')
		}
		const user = await this.userService.getById(result.id)
		if (!user) {
			throw new UnauthorizedException('User not found')
		}
		return this.buildResponseObject(user)
	}

	async buildResponseObject(user: User) {
		const tokens = await this.issueTokens(user.id, user.role)
		return { user: this.omitPassword(user), ...tokens }
	}

	private async issueTokens(userId: string, role: Role) {
		const accessPayload: ITokenPayload = { id: userId, role, type: TokenType.ACCESS }
		const refreshPayload: ITokenPayload = { id: userId, role, type: TokenType.REFRESH }
		const accessToken = this.jwt.sign(accessPayload, {
			expiresIn: this.TOKEN_EXPIRATION_ACCESS
		})
		const refreshToken = this.jwt.sign(refreshPayload, {
			expiresIn: this.TOKEN_EXPIRATION_REFRESH
		})
		return { accessToken, refreshToken }
	}

	private async validateUser(dto: AuthDto) {
		const user = await this.userService.getByLogin(dto.login)
		if (!user) {
			throw new UnauthorizedException('Login or password invalid')
		}
		const isValid = await verify(user.password, dto.password)
		if (!isValid) {
			throw new UnauthorizedException('Login or password invalid')
		}
		return user
	}

	private omitPassword(user: User) {
		return omit(user, ['password'])
	}
}
