import { Type } from 'class-transformer'
import { IsIn, IsOptional } from 'class-validator'

export class ForecastQueryDto {
	@IsOptional() @Type(() => Number) @IsIn([1, 3, 7, 14]) days = 14
	@IsOptional() @IsIn(['true', 'false']) includeRejections: string = 'false'
}
