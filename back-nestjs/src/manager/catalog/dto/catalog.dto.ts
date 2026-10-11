import { Transform, Type } from 'class-transformer'
import {
	IsInt,
	IsNotEmpty,
	IsOptional,
	IsString,
	Max,
	MaxLength,
	Min
} from 'class-validator'

export const normalizeCatalogName = (value: unknown): unknown =>
	typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value

export class UnitInputDto {
	@Transform(({ value }) => normalizeCatalogName(value))
	@IsString()
	@IsNotEmpty({ message: 'Введите название единицы измерения' })
	@MaxLength(30, { message: 'Название единицы — не больше 30 символов' })
	name: string
}

export class ProductInputDto {
	@Transform(({ value }) => normalizeCatalogName(value))
	@IsString()
	@IsNotEmpty({ message: 'Введите название продукта' })
	@MaxLength(150, { message: 'Название продукта — не больше 150 символов' })
	name: string

	@IsString()
	@IsNotEmpty({ message: 'Выберите единицу измерения' })
	@MaxLength(100)
	unitId: string
}

export class ProductsQueryDto {
	@IsOptional()
	@Transform(({ value }) => normalizeCatalogName(value))
	@IsString()
	@MaxLength(150)
	search?: string

	@IsOptional()
	@IsString()
	@MaxLength(100)
	unitId?: string

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(1000000)
	page: number = 1

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(100)
	pageSize: number = 25
}

export class ProductNameQueryDto {
	@Transform(({ value }) => normalizeCatalogName(value))
	@IsString()
	@MaxLength(150)
	name: string

	@IsOptional()
	@IsString()
	@MaxLength(100)
	excludeId?: string
}
