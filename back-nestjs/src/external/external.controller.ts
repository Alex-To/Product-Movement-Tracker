import {
	Body,
	Controller,
	Delete,
	Get,
	Header,
	Param,
	Post,
	Query,
	Req,
	UseGuards,
	UsePipes,
	ValidationPipe
} from '@nestjs/common'
import { Role } from '@prisma/client'
import { Auth } from '../auth/decorators/auth.decorator'
import { CurrentUser } from '../auth/decorators/user.decorator'
import { ExternalApiKeyGuard } from './api-key.guard'
import {
	DecisionDto,
	ExternalQueryDto,
	ExternalSubmissionDto,
	InterfaceInputDto,
	RejectionDto,
	RememberKeyDto
} from './external.dto'
import { ExternalService } from './external.service'

const validation = new ValidationPipe({
	transform: true,
	whitelist: true,
	forbidNonWhitelisted: true
})

@Controller('external/v1')
@UseGuards(ExternalApiKeyGuard)
@UsePipes(validation)
export class ExternalController {
	constructor(private readonly service: ExternalService) {}
	@Get('products') products(@Query() query: ExternalQueryDto) {
		return this.service.products(query)
	}
	@Get('suppliers') suppliers(@Query() query: ExternalQueryDto) {
		return this.service.suppliers(query)
	}
	@Post('delivery-requests') submit(
		@Req() req: { externalInterfaceId: string },
		@Body() dto: ExternalSubmissionDto
	) {
		return this.service.submit(req.externalInterfaceId, dto)
	}
	@Get('delivery-requests') list(
		@Req() req: { externalInterfaceId: string },
		@Query() query: ExternalQueryDto
	) {
		return this.service.list(query, req.externalInterfaceId)
	}
	@Get('delivery-requests/:id') get(
		@Req() req: { externalInterfaceId: string },
		@Param('id') id: string
	) {
		return this.service.get(id, req.externalInterfaceId)
	}
}

@Controller('manager/external-interfaces')
@UsePipes(validation)
export class ManagerExternalController {
	constructor(private readonly service: ExternalService) {}
	@Auth(Role.MANAGER)
	@Get()
	list(@Query() query: ExternalQueryDto) {
		return this.service.interfaces(query)
	}
	@Auth(Role.MANAGER)
	@Post()
	@Header('Cache-Control', 'no-store')
	create(@CurrentUser('id') userId: string, @Body() dto: InterfaceInputDto) {
		return this.service.createInterface(userId, dto.name)
	}
	@Auth(Role.MANAGER)
	@Get('requests')
	requests(@Query() query: ExternalQueryDto) {
		return this.service.list(query)
	}
	@Auth(Role.MANAGER)
	@Get('requests/:id')
	request(@Param('id') id: string) {
		return this.service.get(id)
	}
	@Auth(Role.MANAGER)
	@Post('requests/:id/accept')
	accept(
		@Param('id') id: string,
		@CurrentUser('id') userId: string,
		@Body() dto: DecisionDto
	) {
		return this.service.decide(id, userId, dto)
	}
	@Auth(Role.MANAGER)
	@Post('requests/:id/reject')
	reject(
		@Param('id') id: string,
		@CurrentUser('id') userId: string,
		@Body() dto: RejectionDto
	) {
		return this.service.decide(id, userId, null, dto.comment)
	}
	@Auth(Role.MANAGER)
	@Delete(':id')
	revoke(@Param('id') id: string) {
		return this.service.revoke(id)
	}
	@Auth(Role.MANAGER)
	@Post(':id/restore')
	restore(@Param('id') id: string) {
		return this.service.restore(id)
	}
	@Auth(Role.MANAGER)
	@Get(':id/key')
	@Header('Cache-Control', 'no-store')
	readKey(@Param('id') id: string) {
		return this.service.readKey(id)
	}
	@Auth(Role.MANAGER)
	@Post(':id/key')
	@Header('Cache-Control', 'no-store')
	rememberKey(@Param('id') id: string, @Body() dto: RememberKeyDto) {
		return this.service.rememberKey(id, dto.key)
	}
}
