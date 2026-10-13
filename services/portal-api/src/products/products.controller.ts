import { Controller, Get, Param, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { credentialsFrom, VendorErpService } from '../vendor-erp/vendor-erp.service';
import { toProductView } from './product.view';

@ApiTags('products')
@ApiSecurity('api-key')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(private readonly vendorErpService: VendorErpService) {}

  @Get(':sku')
  async findOne(@Req() request: Request, @Param('sku') sku: string) {
    const product = await this.vendorErpService.fetchVendorProducts(credentialsFrom(request), sku);
    return toProductView(product);
  }
}
