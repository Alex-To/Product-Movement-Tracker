import { IsString, Matches } from 'class-validator'

export class WriteOffDto {
	@IsString()
	batchId: string

	// Строка, чтобы не терять точность Decimal; допускаем запятую
	@Matches(/^\d+([.,]\d{1,3})?$/, {
		message: 'Количество — число, не больше 3 знаков после запятой'
	})
	count: string
}
