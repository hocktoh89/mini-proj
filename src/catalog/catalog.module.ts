import { Module } from '@nestjs/common';
import { AccessScopeService } from './access-scope.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  controllers: [ProductsController],
  providers: [AccessScopeService, ProductsService],
})
export class CatalogModule {}
