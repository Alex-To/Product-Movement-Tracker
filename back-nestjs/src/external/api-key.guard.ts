import {
	CanActivate,
	ExecutionContext,
	Injectable,
	UnauthorizedException,
	HttpException
} from '@nestjs/common'
import { createHash } from 'node:crypto'
import { PrismaService } from '../prisma.service'

export const keyHash = (key: string) =>
	createHash('sha256').update(key).digest('hex')

@Injectable()
export class ExternalApiKeyGuard implements CanActivate {
	private readonly windows = new Map<string, { count: number; until: number }>()
	constructor(private readonly prisma: PrismaService) {}
	private limit(id: string, max: number) {
		const now = Date.now()
		for (const [key, value] of this.windows)
			if (value.until <= now) this.windows.delete(key)
		const entry = this.windows.get(id) ?? { count: 0, until: now + 60000 }
		entry.count++
		this.windows.set(id, entry)
		if (entry.count > max)
			throw new HttpException(
				'Слишком много запросов. Повторите через минуту.',
				429
			)
	}
	async canActivate(context: ExecutionContext) {
		const req = context.switchToHttp().getRequest()
		this.limit('ip:' + req.ip, 180)
		const key = req.headers['x-api-key']
		if (typeof key !== 'string' || !/^eif_[a-f0-9]{12}_[a-f0-9]{64}$/.test(key))
			throw new UnauthorizedException('Неверный API-ключ')
		const source = await this.prisma.externalInterface.findUnique({
			where: { keyHash: keyHash(key) },
			select: { id: true, revokedAt: true }
		})
		if (!source || source.revokedAt)
			throw new UnauthorizedException('Неверный API-ключ')
		this.limit('key:' + source.id, 120)
		req.externalInterfaceId = source.id
		return true
	}
}
