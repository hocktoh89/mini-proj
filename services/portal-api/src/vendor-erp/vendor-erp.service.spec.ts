import { BadGatewayException, HttpException, UnauthorizedException } from '@nestjs/common';
import { AxiosError, AxiosHeaders } from 'axios';
import { VendorErpService } from './vendor-erp.service';

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

describe('VendorErpService', () => {
  const service = new VendorErpService();

  beforeEach(() => jest.clearAllMocks());

  it('forwards only the caller credentials to the ERP', async () => {
    http.get.mockResolvedValue({ data: { id: 1, sku: 'SKU-1001' } });

    await service.fetchVendorProducts({ apiKey: 'mk_key', authorization: 'Bearer t' }, 'SKU 1');

    expect(http.get).toHaveBeenCalledWith('/products/sku/SKU%201', {
      headers: { authorization: 'Bearer t', 'x-api-key': 'mk_key' },
    });
  });

  it('patches the ERP stock using stockQuantity in the request body', async () => {
    http.patch.mockResolvedValue({ data: { id: 1, stockQty: 7 } });

    await service.updateVendorProducts({ apiKey: 'k' }, { sku: 'SKU-1001', qty: 3 });

    expect(http.patch).toHaveBeenCalledWith(
      '/products/SKU-1001/stock',
      { stockQuantity: 3 },
      { headers: { 'x-api-key': 'k' } },
    );
  });

  it('rejects without calling the ERP when the caller is not logged in', async () => {
    await expect(service.fetchVendorProducts({}, 'SKU-1001')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(http.get).not.toHaveBeenCalled();
  });

  it('passes ERP 4xx responses through with the same status and body', async () => {
    const body = { statusCode: 409, message: 'exceeds stock', error: 'Conflict' };
    http.patch.mockRejectedValue(errorWith(409, body));

    const error = await service
      .updateVendorProducts({ apiKey: 'k' }, { sku: 'SKU-1001', qty: 5 })
      .catch((e: HttpException) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toEqual(body);
  });

  it('maps ERP failures and network errors to 502', async () => {
    http.get.mockRejectedValue(errorWith(500, {}));
    await expect(service.fetchCurrentUser({ apiKey: 'k' })).rejects.toThrow(BadGatewayException);

    http.get.mockRejectedValue(errorWith());
    await expect(service.fetchCurrentUser({ apiKey: 'k' })).rejects.toThrow(BadGatewayException);
  });
});
