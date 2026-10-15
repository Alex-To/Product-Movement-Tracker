import { Type, Transform } from 'class-transformer'
import {
	ArrayMaxSize,
	ArrayMinSize,
	IsArray,
	IsDateString,
	IsEnum,
	IsInt,
	IsOptional,
	IsString,
	Matches,
	Max,
	MaxLength,
	Min,
	MinLength,
	ValidateNested
} from 'class-validator'
import { ExternalRequestStatus } from '@prisma/client'
import { DeliveryInputDto } from '../manager/deliveries/deliveries.dto'
import { OmitType } from '@nestjs/mapped-types'

export class ExternalSubmissionDto extends OmitType(DeliveryInputDto, [
	'receivedAt'
] as const) {}
export class InterfaceInputDto {
	@Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
	@IsString()
	@MaxLength(150)
	@MinLength(1)
	name: string
}
export class RememberKeyDto {
	@IsString()
	@Matches(/^eif_[a-f0-9]{12}_[a-f0-9]{64}$/)
	key: string
}
export class ExternalQueryDto {
	@IsOptional() @IsString() @MaxLength(150) search?: string
	@Type(() => Number) @IsInt() @Min(1) @Max(1000000) page = 1
	@IsOptional() @IsEnum(ExternalRequestStatus) status?: ExternalRequestStatus
	@IsOptional() @IsString() @MaxLength(100) interfaceId?: string
	@IsOptional() @IsString() @MaxLength(100) supplierId?: string
}
class DecisionLineDto {
	@IsString() @MaxLength(100) lineId: string
	@Transform(({ value }) =>
		typeof value === 'string' ? value.trim().replace(',', '.') : value
	)
	@IsString()
	@Matches(/^\d{1,9}(\.\d{1,3})?$/)
	quantity: string
}
export class DecisionDto {
	@IsArray()
	@ArrayMinSize(1)
	@ArrayMaxSize(100)
	@ValidateNested({ each: true })
	@Type(() => DecisionLineDto)
	lines: DecisionLineDto[]
	@IsOptional() @IsString() @MaxLength(1000) comment?: string
	@IsOptional()
	@IsDateString({ strict: true })
	@Matches(/T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/)
	receivedAt?: string
}
export class RejectionDto {
	@IsOptional() @IsString() @MaxLength(1000) comment?: string
}
