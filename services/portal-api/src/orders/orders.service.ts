import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toProductView } from '../products/product.view';
import { VendorErpService } from '../vendor-erp/vendor-erp.service';
import { CreateOrderDto, OrderItemDto } from './dto/create-order.dto';

@Injectable()
export class OrdersService {
  constructor(
    private readonly vendorErpService: VendorErpService,
    private readonly prisma: PrismaService,
  ) {}

  // The ERP decides everything here using the caller's token: whether they may order at all
  // (catalog.stock.update), whether they can see each SKU (404 otherwise) and whether there is
  // enough stock (409).
  async create(authorization: string, dto: CreateOrderDto) {
    const items = mergeItems(dto.items);
    const user = await this.vendorErpService.fetchCurrentUser(authorization);

    // Check every item before deducting any, so one unavailable item rejects the whole order
    // without touching the stock of the others.
    await Promise.all(
      items.map((item) => this.vendorErpService.checkProductsQtyAvailability(authorization, item)),
    );
    const products = await Promise.all(
      items.map((item) => this.vendorErpService.updateVendorProducts(authorization, item)),
    );

    const order = await this.prisma.order.create({
      data: {
        userId: user.id,
        orderItems: {
          create: items.map((item) => ({ productSku: item.sku, quantity: item.qty })),
        },
      },
      include: { orderItems: true },
    });
    return { order, products: products.map(toProductView) };
  }
}

// One line per SKU: repeated SKUs are summed, so availability is checked for the total quantity.
function mergeItems(items: OrderItemDto[]): OrderItemDto[] {
  const qtyBySku = new Map<string, number>();
  for (const { sku, qty } of items) {
    const key = sku.trim().toUpperCase();
    qtyBySku.set(key, (qtyBySku.get(key) ?? 0) + qty);
  }
  return [...qtyBySku].map(([sku, qty]) => ({ sku, qty }));
}
