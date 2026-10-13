import { Controller, Get, Query, UsePipes, ValidationPipe } from '@nestjs/common'
import { PartialType } from '@nestjs/mapped-types'
import { Role } from '@prisma/client'
import { Auth } from '../auth/decorators/auth.decorator'
import { SettingsDto } from '../settings/settings.dto'
import { WaiterService } from './waiter.service'

// Те же пределы, что у настроек; любое поле можно не передавать — возьмётся сохранённое
class HotPreviewQueryDto extends PartialType(SettingsDto) {}

/**
 * Предпросмотр горячих предложений для менеджера на странице настроек:
 * какие блюда горячие и почему. Официант видит только отметку
 */
@Controller('manager/hot-preview')
@UsePipes(
	new ValidationPipe({
		transform: true,
		transformOptions: { enableImplicitConversion: true },
		whitelist: true,
		forbidNonWhitelisted: true
	})
)
export class HotPreviewController {
	constructor(private readonly waiterService: WaiterService) {}

	@Get()
	@Auth(Role.MANAGER)
	preview(@Query() overrides: HotPreviewQueryDto) {
		return this.waiterService.hotPreview(overrides)
	}
}
