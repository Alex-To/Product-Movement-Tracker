import { HotOffersModule } from '../inventory/hot-offers.module'
import { Module } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { ManagerCatalogController } from './catalog/manager-catalog.controller'
import { ManagerCatalogService } from './catalog/manager-catalog.service'
import { ManagerDeliveriesController } from './deliveries/deliveries.controller'
import { ManagerDeliveriesService } from './deliveries/deliveries.service'
import { ManagerDishesController } from './dishes/dishes.controller'
import { ManagerDishesService } from './dishes/dishes.service'
import { ManagerRejectionsController } from './rejections/rejections.controller'
import { ManagerRejectionsService } from './rejections/rejections.service'
import { ManagerWarehouseController } from './warehouse/warehouse.controller'
import { ManagerWarehouseService } from './warehouse/warehouse.service'
import { ManagerStatisticsController } from './statistics/statistics.controller'
import { ManagerStatisticsService } from './statistics/statistics.service'
import { StockStatisticsController } from './statistics/stock-statistics.controller'
import { StockStatisticsService } from './statistics/stock-statistics.service'

@Module({
	imports: [HotOffersModule],
	controllers: [
		ManagerCatalogController,
		ManagerDeliveriesController,
		ManagerDishesController,
		ManagerRejectionsController,
		ManagerWarehouseController,
		ManagerStatisticsController,
		StockStatisticsController
	],
	providers: [
		ManagerCatalogService,
		ManagerDeliveriesService,
		ManagerDishesService,
		ManagerRejectionsService,
		ManagerWarehouseService,
		ManagerStatisticsService,
		StockStatisticsService,
		PrismaService
	]
})
export class ManagerModule {}
