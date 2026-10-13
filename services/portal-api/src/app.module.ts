import { Module } from '@nestjs/common';
import { VendorErpModule } from './vendor-erp/vendor-erp.module';
import { OrdersModule } from './orders/orders.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';

@Module({
  imports: [PrismaModule, VendorErpModule, ProductsModule, OrdersModule],
})
export class AppModule {}
