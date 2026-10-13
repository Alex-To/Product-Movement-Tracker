import {
	Body,
	Controller,
	Get,
	Put,
	UsePipes,
	ValidationPipe
} from '@nestjs/common'
import { Role } from '@prisma/client'
import { Auth } from '../auth/decorators/auth.decorator'
import { SettingsDto } from './settings.dto'
import { SettingsService } from './settings.service'

@Controller('manager/settings')
@UsePipes(
	new ValidationPipe({
		transform: true,
		whitelist: true,
		forbidNonWhitelisted: true
	})
)
export class SettingsController {
	constructor(private readonly service: SettingsService) {}

	@Get()
	@Auth(Role.MANAGER)
	get() {
		return this.service.get()
	}

	@Put()
	@Auth(Role.MANAGER)
	update(@Body() dto: SettingsDto) {
		return this.service.update(dto)
	}
}
