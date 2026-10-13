import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { VendorErpService } from '../vendor-erp/vendor-erp.service';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  const credentials = { authorization: 'Bearer token' };
  let service: OrdersService;
  let erp: { fetchCurrentUser: jest.Mock; updateVendorProducts: jest.Mock };
  let prisma: { order: { create: jest.Mock } };

  beforeEach(async () => {
    erp = {
      fetchCurrentUser: jest.fn().mockResolvedValue({ id: 7, email: 'john@example.com' }),
      updateVendorProducts: jest
        .fn()
        .mockResolvedValue({ id: 1, sku: 'SKU-1001', stockQty: 8, availability: true }),
    };
    prisma = {
      order: { create: jest.fn().mockImplementation(({ data }) => ({ id: 42, ...data })) },
    };
    const module = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: VendorErpService, useValue: erp },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(OrdersService);
  });

  it('deducts ERP stock with the caller credentials and records the order for that user', async () => {
    const result = await service.create(credentials, { sku: ' sku-1001 ', quantity: 2 });

    expect(erp.fetchCurrentUser).toHaveBeenCalledWith(credentials);
    expect(erp.updateVendorProducts).toHaveBeenCalledWith(credentials, { sku: 'SKU-1001', qty: 2 });
    expect(prisma.order.create).toHaveBeenCalledWith({
      data: { sku: 'SKU-1001', quantity: 2, userId: 7 },
    });
    expect(result).toEqual({
      order: { id: 42, sku: 'SKU-1001', quantity: 2, userId: 7 },
      product: { id: 1, sku: 'SKU-1001', stockQuantity: 8, availability: true },
    });
  });

  it('records nothing when the ERP rejects the quantity', async () => {
    erp.updateVendorProducts.mockRejectedValue(new ConflictException('exceeds stock'));

    await expect(service.create(credentials, { sku: 'SKU-1001', quantity: 99 })).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.order.create).not.toHaveBeenCalled();
  });
});
