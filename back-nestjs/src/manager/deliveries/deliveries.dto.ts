import { Transform, Type } from 'class-transformer'
import {
	ArrayMaxSize,
	ArrayMinSize,
	IsArray,
	IsDateString,
	IsInt,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	Matches,
	Max,
	MaxLength,
	Min,
	ValidateNested
} from 'class-validator'
import { normalizeCatalogName } from '../catalog/dto/catalog.dto'

export class SupplierInputDto {
	@Transform(({ value }) => normalizeCatalogName(value))
	@IsString()
	@IsNotEmpty()
	@MaxLength(150)
	name: string
}

export class DeliveryLineDto {
	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	productId: string

	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	unitId: string

	@Transform(({ value }) =>
		typeof value === 'string' ? value.trim().replace(',', '.') : value
	)
	@IsString()
	@Matches(/^\d{1,9}(\.\d{1,3})?$/, {
		message: 'Количество: до 9 целых и 3 дробных цифр'
	})
	quantity: string

	@IsDateString({ strict: true })
	@Matches(/T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/, {
		message: 'Срок годности должен содержать дату, время и часовой пояс'
	})
	expiresAt: string
}

export class DeliveryInputDto {
	@IsUUID('4')
	requestId: string

	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	supplierId: string

	@Transform(({ value }) => normalizeCatalogName(value))
	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	number: string

	@Transform(({ value }) =>
		value === '' || value === null ? undefined : value
	)
	@IsOptional()
	@IsDateString({ strict: true })
	@Matches(/T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/, {
		message: 'Дата приёма должна содержать дату, время и часовой пояс'
	})
	receivedAt?: string

	@IsArray()
	@ArrayMinSize(1)
	@ArrayMaxSize(100)
	@ValidateNested({ each: true })
	@Type(() => DeliveryLineDto)
	lines: DeliveryLineDto[]
}

export class DeliveriesQueryDto {
	@IsOptional()
	@Transform(({ value }) => normalizeCatalogName(value))
	@IsString()
	@MaxLength(150)
	search?: string

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(1000000)
	page: number = 1
}
