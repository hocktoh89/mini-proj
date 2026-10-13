import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, RequirePermissions } from '../auth/auth.decorators';
import { CATALOG_READ } from './catalog.permissions';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { ProductsService } from './products.service';

// Which rows and columns come back depends on the caller's hierarchy nodes, overrides and field
// rules (see AccessScopeService); this guard only decides whether the endpoint is callable at all.
@ApiTags('catalog')
@ApiSecurity('api-key')
@ApiBearerAuth()
@RequirePermissions(CATALOG_READ)
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListProductsQueryDto) {
    return this.products.list(user.id, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.products.get(user.id, id);
  }
}
