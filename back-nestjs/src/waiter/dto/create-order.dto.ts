import { Type } from 'class-transformer'
import {
	ArrayMaxSize,
	ArrayMinSize,
	ArrayUnique,
	IsArray,
	IsInt,
	IsOptional,
	IsString,
	Max,
	Min,
	ValidateNested
} from 'class-validator'

export class OrderItemDto {
	@IsString()
	dishId: string

	@IsInt({ message: 'Количество порций — целое число' })
	@Min(1, { message: 'Количество порций — от 1' })
	@Max(999)
	count: number

	// Продукты состава, которые гость попросил убрать
	@IsOptional()
	@IsArray()
	@ArrayMaxSize(50)
	@ArrayUnique({ message: 'Продукт указан дважды' })
	@IsString({ each: true })
	excludedProductIds?: string[]
}

export class CreateOrderDto {
	@IsArray()
	@ArrayMinSize(1, { message: 'Чек пуст' })
	@ValidateNested({ each: true })
	@Type(() => OrderItemDto)
	items: OrderItemDto[]
}
