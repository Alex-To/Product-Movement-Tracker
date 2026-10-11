import { Module } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { ManagerCatalogController } from './catalog/manager-catalog.controller'
import { ManagerCatalogService } from './catalog/manager-catalog.service'
import { ManagerDeliveriesController } from './deliveries/deliveries.controller'
import { ManagerDeliveriesService } from './deliveries/deliveries.service'
import { ManagerDishesController } from './dishes/dishes.controller'
import { ManagerDishesService } from './dishes/dishes.service'
import { ManagerWarehouseController } from './warehouse/warehouse.controller'
import { ManagerWarehouseService } from './warehouse/warehouse.service'

@Module({
	controllers: [ManagerCatalogController, ManagerDeliveriesController, ManagerDishesController, ManagerWarehouseController],
	providers: [ManagerCatalogService, ManagerDeliveriesService, ManagerDishesService, ManagerWarehouseService, PrismaService]
})
export class ManagerModule {}
