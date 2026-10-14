import { IsString, Matches } from 'class-validator'

export class StatisticsQueryDto {
	@IsString()
	@Matches(/^\d{4}-\d{2}-\d{2}$/, {
		message: 'Дата начала должна иметь вид ГГГГ-ММ-ДД'
	})
	from: string

	@IsString()
	@Matches(/^\d{4}-\d{2}-\d{2}$/, {
		message: 'Дата окончания должна иметь вид ГГГГ-ММ-ДД'
	})
	to: string
}
