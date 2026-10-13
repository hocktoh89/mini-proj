import { BadGatewayException, HttpException, UnauthorizedException } from '@nestjs/common';
import { AxiosError, AxiosHeaders } from 'axios';
import type { Request } from 'express';
import { bearerFrom, VendorErpService } from './vendor-erp.service';

const http = { get: jest.fn(), patch: jest.fn() };
jest.mock('axios', () => {
  const actual = jest.requireActual('axios');
  return { __esModule: true, ...actual, default: { ...actual.default, create: () => http } };
});

const errorWith = (status?: number, data?: unknown) =>
  new AxiosError(
    'request failed',
    undefined,
    undefined,
    undefined,
    status === undefined
      ? undefined
      : { status, data, statusText: '', headers: {}, config: { headers: new AxiosHeaders() } },
  );

describe('bearerFrom', () => {
  const request = (authorization?: string) => ({ headers: { authorization } }) as Request;

  it('returns the Authorization header of a Bearer request', () => {
    expect(bearerFrom(request('Bearer abc'))).toBe('Bearer abc');
  });

  it('rejects requests without a Bearer token', () => {
    expect(() => bearerFrom(request())).toThrow(UnauthorizedException);
    expect(() => bearerFrom(request('Basic abc'))).toThrow(UnauthorizedException);
  });
});

describe('VendorErpService', () => {
  const service = new VendorErpService();
  const authorization = 'Bearer t';

  beforeEach(() => jest.clearAllMocks());

  it('forwards the caller token to the ERP', async () => {
    http.get.mockResolvedValue({ data: { id: 1, sku: 'SKU-1001' } });

    await service.fetchVendorProducts(authorization, 'SKU 1');

    expect(http.get).toHaveBeenCalledWith('/products/sku/SKU%201', {
      headers: { authorization },
    });
  });

  it('patches the ERP stock using stockQuantity in the request body', async () => {
    http.patch.mockResolvedValue({ data: { id: 1, stockQty: 7 } });

    await service.updateVendorProducts(authorization, { sku: 'SKU-1001', qty: 3 });

    expect(http.patch).toHaveBeenCalledWith(
      '/products/SKU-1001/stock',
      { stockQuantity: 3 },
      { headers: { authorization } },
    );
  });

  it('passes ERP 4xx responses through with the same status and body', async () => {
    const body = { statusCode: 409, message: 'exceeds stock', error: 'Conflict' };
    http.patch.mockRejectedValue(errorWith(409, body));

    const error = await service
      .updateVendorProducts(authorization, { sku: 'SKU-1001', qty: 5 })
      .catch((e: HttpException) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toEqual(body);
  });

  it('maps ERP failures and network errors to 502', async () => {
    http.get.mockRejectedValue(errorWith(500, {}));
    await expect(service.fetchCurrentUser(authorization)).rejects.toThrow(BadGatewayException);

    http.get.mockRejectedValue(errorWith());
    await expect(service.fetchCurrentUser(authorization)).rejects.toThrow(BadGatewayException);
  });
});
