import { Transform, Type } from 'class-transformer'
import {
	IsDateString,
	ArrayMaxSize,
	ArrayMinSize,
	ArrayUnique,
	IsArray,
	IsIn,
	IsInt,
	IsNotEmpty,
	IsOptional,
	IsString,
	Matches,
	Max,
	MaxLength,
	Min,
	ValidateNested
} from 'class-validator'

export class ManualHotOfferDto {
	@IsOptional()
	@IsDateString({ strict: true })
	@Matches(/T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/, {
		message: 'Укажите дату и время с часовым поясом'
	})
	expiresAt?: string | null
}
import { normalizeCatalogName } from '../catalog/dto/catalog.dto'

export class IngredientDto {
	@IsString() @IsNotEmpty() @MaxLength(100) productId: string
	@IsString() @IsNotEmpty() @MaxLength(100) unitId: string
	@Transform(({ value }) =>
		typeof value === 'string' ? value.trim().replace(',', '.') : value
	)
	@IsString()
	@Matches(/^\d{1,9}(\.\d{1,3})?$/, {
		message: 'Количество: до 9 целых и 3 дробных цифр'
	})
	quantity: string
}
export class DishInputDto {
	@Transform(({ value }) => normalizeCatalogName(value))
	@IsString()
	@IsNotEmpty()
	@MaxLength(150)
	name: string
	@IsArray()
	@ArrayMinSize(1)
	@ArrayMaxSize(100)
	@ArrayUnique((item: IngredientDto) => item?.productId, {
		message: 'Этот продукт уже есть. Увеличьте количество в существующей строке'
	})
	@ValidateNested({ each: true })
	@Type(() => IngredientDto)
	ingredients: IngredientDto[]
}
export class DishVersionDto {
	@IsInt() @Min(1) @Max(2147483646) version: number
}
export class DishUpdateDto extends DishInputDto {
	@IsInt() @Min(1) @Max(2147483646) version: number
}
export class DishesQueryDto {
	@IsOptional() @IsIn(['active', 'trash']) scope: string = 'active'
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
