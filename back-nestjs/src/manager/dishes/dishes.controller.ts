import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Patch,
	Post,
	Query,
	UploadedFile,
	UseInterceptors,
	UsePipes,
	ValidationPipe
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { Role } from '@prisma/client'
import { DISH_IMAGE_MAX_BYTES, type UploadedImage } from './dish-image.storage'
import { Auth } from '../../auth/decorators/auth.decorator'
import {
	DishesQueryDto,
	DishInputDto,
	DishUpdateDto,
	DishVersionDto
} from './dishes.dto'
import { ManagerDishesService } from './dishes.service'
import { ProductNameQueryDto } from '../catalog/dto/catalog.dto'
@Controller('manager/dishes')
@UsePipes(
	new ValidationPipe({
		transform: true,
		whitelist: true,
		forbidNonWhitelisted: true
	})
)
export class ManagerDishesController {
	constructor(private readonly service: ManagerDishesService) {}
	@Get() @Auth(Role.MANAGER) list(@Query() dto: DishesQueryDto) {
		return this.service.list(dto)
	}
	@Get('name-check') @Auth(Role.MANAGER) checkName(
		@Query() dto: ProductNameQueryDto
	) {
		return this.service.checkName(dto.name, dto.excludeId)
	}
	@Get(':id') @Auth(Role.MANAGER) get(@Param('id') id: string) {
		return this.service.get(id)
	}
	@Post() @Auth(Role.MANAGER) create(@Body() dto: DishInputDto) {
		return this.service.create(dto)
	}
	@Patch(':id') @Auth(Role.MANAGER) update(
		@Param('id') id: string,
		@Body() dto: DishUpdateDto
	) {
		return this.service.update(id, dto)
	}
	@Patch(':id/trash') @Auth(Role.MANAGER) trash(
		@Param('id') id: string,
		@Body() dto: DishVersionDto
	) {
		return this.service.trash(id, dto.version)
	}
	@Patch(':id/restore') @Auth(Role.MANAGER) restore(
		@Param('id') id: string,
		@Body() dto: DishVersionDto
	) {
		return this.service.restore(id, dto.version)
	}
	// Фото не меняет version: открытая форма рецепта не получит ложный конфликт
	@Post(':id/image')
	@Auth(Role.MANAGER)
	@UseInterceptors(
		FileInterceptor('image', { limits: { fileSize: DISH_IMAGE_MAX_BYTES } })
	)
	uploadImage(@Param('id') id: string, @UploadedFile() file?: UploadedImage) {
		return this.service.setImage(id, file)
	}
	@Delete(':id/image') @Auth(Role.MANAGER) removeImage(@Param('id') id: string) {
		return this.service.removeImage(id)
	}
}
