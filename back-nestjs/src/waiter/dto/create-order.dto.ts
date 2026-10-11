import { Type } from 'class-transformer'
import {
	ArrayMinSize,
	IsArray,
	IsInt,
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
}

export class CreateOrderDto {
	@IsArray()
	@ArrayMinSize(1, { message: 'Чек пуст' })
	@ValidateNested({ each: true })
	@Type(() => OrderItemDto)
	items: OrderItemDto[]
}
