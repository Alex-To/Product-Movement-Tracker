import { Transform, Type } from 'class-transformer'
import {
	ArrayMaxSize,
	ArrayMinSize,
	IsArray,
	IsIn,
	IsInt,
	IsOptional,
	IsString,
	Max,
	MaxLength,
	Min
} from 'class-validator'
import { normalizeCatalogName } from '../catalog/dto/catalog.dto'
export class WarehousePageDto {
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(1000000)
	page: number = 1
}
export class WarehouseQueryDto extends WarehousePageDto {
	@IsOptional()
	@Transform(({ value }) => normalizeCatalogName(value))
	@IsString()
	@MaxLength(150)
	search?: string
	@IsOptional() @IsIn(['true', 'false']) expiringOnly: string = 'false'
}
export class ReadMessagesDto {
	@IsArray()
	@ArrayMinSize(1)
	@ArrayMaxSize(100)
	@IsString({ each: true })
	ids: string[]
}
