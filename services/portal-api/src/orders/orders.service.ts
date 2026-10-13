import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toProductView } from '../products/product.view';
import { VendorErpService } from '../vendor-erp/vendor-erp.service';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrdersService {
  constructor(
    private readonly vendorErpService: VendorErpService,
    private readonly prisma: PrismaService,
  ) {}

  // The ERP decides everything here using the caller's login: whether they may order at all
  // (catalog.stock.update), whether they can see the SKU (404 otherwise) and whether there is
  // enough stock (409). The order is only recorded once the stock has been taken.
  async create(authorization: string, dto: CreateOrderDto) {
    const sku = dto.sku.trim().toUpperCase();
    const user = await this.vendorErpService.fetchCurrentUser(authorization);
    const product = await this.vendorErpService.updateVendorProducts(authorization, {
      sku,
      qty: dto.quantity,
    });
    const order = await this.prisma.order.create({
      data: { sku, quantity: dto.quantity, userId: user.id },
    });
    return { order, product: toProductView(product) };
  }
}
