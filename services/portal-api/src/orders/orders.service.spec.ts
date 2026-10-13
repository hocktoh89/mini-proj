import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { VendorErpService } from '../vendor-erp/vendor-erp.service';
import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  const authorization = 'Bearer token';
  let service: OrdersService;
  let erp: {
    fetchCurrentUser: jest.Mock;
    checkProductsQtyAvailability: jest.Mock;
    updateVendorProducts: jest.Mock;
  };
  let prisma: { order: { create: jest.Mock } };

  beforeEach(async () => {
    erp = {
      fetchCurrentUser: jest.fn().mockResolvedValue({ id: 7, email: 'john@example.com' }),
      checkProductsQtyAvailability: jest.fn().mockResolvedValue({ id: 1, stockQty: 10 }),
      updateVendorProducts: jest
        .fn()
        .mockImplementation((_auth: string, { sku }: { sku: string }) => ({
          id: 1,
          sku,
          stockQty: 5,
        })),
    };
    prisma = { order: { create: jest.fn().mockResolvedValue({ id: 42 }) } };
    const module = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: VendorErpService, useValue: erp },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(OrdersService);
  });

  it('checks then deducts every item with the caller token and records one order', async () => {
    const result = await service.create(authorization, {
      items: [
        { sku: 'SKU-1001', qty: 2 },
        { sku: 'SKU-1002', qty: 1 },
      ],
    });

    expect(erp.fetchCurrentUser).toHaveBeenCalledWith(authorization);
    for (const call of [erp.checkProductsQtyAvailability, erp.updateVendorProducts]) {
      expect(call).toHaveBeenCalledWith(authorization, { sku: 'SKU-1001', qty: 2 });
      expect(call).toHaveBeenCalledWith(authorization, { sku: 'SKU-1002', qty: 1 });
    }
    expect(prisma.order.create).toHaveBeenCalledWith({
      data: {
        userId: 7,
        orderItems: {
          create: [
            { productSku: 'SKU-1001', quantity: 2 },
            { productSku: 'SKU-1002', quantity: 1 },
          ],
        },
      },
      include: { orderItems: true },
    });
    expect(result).toEqual({
      order: { id: 42 },
      products: [
        { id: 1, sku: 'SKU-1001', stockQuantity: 5 },
        { id: 1, sku: 'SKU-1002', stockQuantity: 5 },
      ],
    });
  });

  it('merges repeated SKUs so availability is checked for the total quantity', async () => {
    await service.create(authorization, {
      items: [
        { sku: 'sku-1001', qty: 2 },
        { sku: ' SKU-1001 ', qty: 3 },
      ],
    });

    expect(erp.checkProductsQtyAvailability).toHaveBeenCalledTimes(1);
    expect(erp.checkProductsQtyAvailability).toHaveBeenCalledWith(authorization, {
      sku: 'SKU-1001',
      qty: 5,
    });
  });

  it.each([
    ['over stock', new ConflictException('not available')],
    ['hidden or unknown SKU', new NotFoundException()],
  ])('deducts nothing and records nothing when one item fails the check (%s)', async (_, error) => {
    erp.checkProductsQtyAvailability
      .mockResolvedValueOnce({ id: 1, stockQty: 10 })
      .mockRejectedValueOnce(error);

    await expect(
      service.create(authorization, {
        items: [
          { sku: 'SKU-1001', qty: 1 },
          { sku: 'SKU-1002', qty: 99 },
        ],
      }),
    ).rejects.toBe(error);
    expect(erp.updateVendorProducts).not.toHaveBeenCalled();
    expect(prisma.order.create).not.toHaveBeenCalled();
  });
});
