import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UsePipes, ValidationPipe } from '@nestjs/common'
import { Role } from '@prisma/client'
import { Auth } from '../../auth/decorators/auth.decorator'
import { ProductInputDto, ProductNameQueryDto, ProductsQueryDto, UnitInputDto } from './dto/catalog.dto'
import { ManagerCatalogService } from './manager-catalog.service'

@Controller('manager')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
export class ManagerCatalogController {
	constructor(private readonly catalog: ManagerCatalogService) {}

	@Get('units')
	@Auth(Role.MANAGER)
	getUnits() { return this.catalog.getUnits() }

	@Post('units')
	@Auth(Role.MANAGER)
	createUnit(@Body() dto: UnitInputDto) { return this.catalog.createUnit(dto) }

	@Delete('units/:id')
	@HttpCode(204)
	@Auth(Role.MANAGER)
	deleteUnit(@Param('id') id: string) { return this.catalog.deleteUnit(id) }

	@Get('products')
	@Auth(Role.MANAGER)
	getProducts(@Query() query: ProductsQueryDto) { return this.catalog.getProducts(query) }

	@Get('products/name-check')
	@Auth(Role.MANAGER)
	checkName(@Query() query: ProductNameQueryDto) { return this.catalog.checkName(query.name, query.excludeId) }

	@Post('products')
	@Auth(Role.MANAGER)
	createProduct(@Body() dto: ProductInputDto) { return this.catalog.createProduct(dto) }

	@Patch('products/:id')
	@Auth(Role.MANAGER)
	updateProduct(@Param('id') id: string, @Body() dto: ProductInputDto) { return this.catalog.updateProduct(id, dto) }

	@Delete('products/:id')
	@HttpCode(204)
	@Auth(Role.MANAGER)
	deleteProduct(@Param('id') id: string) { return this.catalog.deleteProduct(id) }
}
