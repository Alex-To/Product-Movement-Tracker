import { Module } from '@nestjs/common'
import { HotOffersService } from './hot-offers.service'

@Module({ providers: [HotOffersService], exports: [HotOffersService] })
export class HotOffersModule {}
