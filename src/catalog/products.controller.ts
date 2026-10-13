import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, RequirePermissions } from '../auth/auth.decorators';
import { CATALOG_READ, CATALOG_STOCK_UPDATE } from './catalog.permissions';
import { BatchProductsDto } from './dto/batch-products.dto';
import { DeductStockDto } from './dto/deduct-stock.dto';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { ProductsService } from './products.service';

// Which rows and columns come back depends on the caller's hierarchy nodes, overrides and field
// rules (see AccessScopeService); this guard only decides whether the endpoint is callable at all.
@ApiTags('catalog')
@ApiBearerAuth()
@RequirePermissions(CATALOG_READ)
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListProductsQueryDto) {
    return this.products.list(user.id, query);
  }

  // The SKU routes below came from the mock ERP. SKUs are matched case-insensitively, and stock is
  // products.stockQty. A product the caller can't see answers the same as a missing one.
  @Get('sku/:sku')
  getBySku(@CurrentUser() user: AuthUser, @Param('sku') sku: string) {
    return this.products.getBySku(user.id, sku);
  }

  @Get('availability/:sku/qty/:qty')
  checkAvailability(
    @CurrentUser() user: AuthUser,
    @Param('sku') sku: string,
    @Param('qty', ParseIntPipe) qty: number,
  ) {
    return this.products.checkAvailability(user.id, sku, qty);
  }

  // Unknown and hidden SKUs are left out of the result.
  @Post('batch')
  batch(@CurrentUser() user: AuthUser, @Body() dto: BatchProductsDto) {
    return this.products.getBatch(user.id, dto.skus);
  }

  @RequirePermissions(CATALOG_READ, CATALOG_STOCK_UPDATE)
  @Patch(':sku/stock')
  deductStock(
    @CurrentUser() user: AuthUser,
    @Param('sku') sku: string,
    @Body() dto: DeductStockDto,
  ) {
    return this.products.deductStock(user.id, sku, dto.stockQuantity);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.products.get(user.id, id);
  }
}
