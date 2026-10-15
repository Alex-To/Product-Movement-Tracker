import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

@Injectable()
export class KeyEncryptionService {
	constructor(private readonly config: ConfigService) {}
	private secret() {
		const value = this.config.get<string>('EXTERNAL_KEYS_ENCRYPTION_KEY') ?? ''
		if (
			!/^[A-Za-z0-9+/]{43}=$/.test(value) ||
			Buffer.from(value, 'base64').length !== 32
		)
			throw new ServiceUnavailableException(
				'Не настроен ключ шифрования внешних интерфейсов: EXTERNAL_KEYS_ENCRYPTION_KEY'
			)
		return Buffer.from(value, 'base64')
	}
	encrypt(value: string, prefix: string) {
		const iv = randomBytes(12),
			cipher = createCipheriv('aes-256-gcm', this.secret(), iv)
		cipher.setAAD(Buffer.from(prefix))
		const ciphertext = Buffer.concat([
			cipher.update(value, 'utf8'),
			cipher.final()
		])
		return [
			'v1',
			iv.toString('base64'),
			cipher.getAuthTag().toString('base64'),
			ciphertext.toString('base64')
		].join('.')
	}
	decrypt(value: string, prefix: string) {
		const secret = this.secret()
		try {
			const [version, iv, tag, ciphertext, ...extra] = value.split('.')
			if (version !== 'v1' || extra.length || !iv || !tag || !ciphertext)
				throw Error('Invalid ciphertext')
			const decipher = createDecipheriv(
				'aes-256-gcm',
				secret,
				Buffer.from(iv, 'base64')
			)
			decipher.setAAD(Buffer.from(prefix))
			decipher.setAuthTag(Buffer.from(tag, 'base64'))
			return Buffer.concat([
				decipher.update(Buffer.from(ciphertext, 'base64')),
				decipher.final()
			]).toString('utf8')
		} catch {
			throw new ServiceUnavailableException(
				'Не удалось расшифровать API-ключ. Проверьте ключ шифрования сервера.'
			)
		}
	}
}
