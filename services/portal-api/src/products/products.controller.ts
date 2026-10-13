import { Controller, Get, Param, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { bearerFrom, VendorErpService } from '../vendor-erp/vendor-erp.service';
import { toProductView } from './product.view';

@ApiTags('products')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(private readonly vendorErpService: VendorErpService) {}

  @Get(':sku')
  async findOne(@Req() request: Request, @Param('sku') sku: string) {
    const product = await this.vendorErpService.fetchVendorProducts(bearerFrom(request), sku);
    return toProductView(product);
  }
}
