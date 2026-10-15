import { ConfigService } from '@nestjs/config'
import { KeyEncryptionService } from './key-encryption.service'

const service = (secret = Buffer.alloc(32, 7).toString('base64')) =>
	new KeyEncryptionService({ get: () => secret } as unknown as ConfigService)
describe('external key encryption', () => {
	it('encrypts reversibly using a random nonce without exposing the original', () => {
		const encryption = service(),
			key = 'eif_example_secret'
		const first = encryption.encrypt(key, 'source'),
			second = encryption.encrypt(key, 'source')
		expect(first).not.toBe(second)
		expect(first).not.toContain(key)
		expect(encryption.decrypt(first, 'source')).toBe(key)
	})
	it('rejects a wrong server secret, swapped source or damaged ciphertext', () => {
		const encryption = service(),
			ciphertext = encryption.encrypt('key', 'source')
		expect(() =>
			service(Buffer.alloc(32, 8).toString('base64')).decrypt(
				ciphertext,
				'source'
			)
		).toThrow()
		expect(() => encryption.decrypt(ciphertext, 'another')).toThrow()
		expect(() => encryption.decrypt('broken', 'source')).toThrow()
		const parts = ciphertext.split('.')
		parts[2] = Buffer.alloc(16).toString('base64')
		expect(() => encryption.decrypt(parts.join('.'), 'source')).toThrow()
	})
	it('fails explicitly when the server secret is missing or invalid', () => {
		expect(() => service('').encrypt('key', 'source')).toThrow(
			'EXTERNAL_KEYS_ENCRYPTION_KEY'
		)
		expect(() => service('short').encrypt('key', 'source')).toThrow(
			'EXTERNAL_KEYS_ENCRYPTION_KEY'
		)
	})
})
