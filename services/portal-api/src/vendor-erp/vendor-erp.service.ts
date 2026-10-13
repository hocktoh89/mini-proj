import {
  BadGatewayException,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import axios, { AxiosInstance, isAxiosError } from 'axios';
import type { Request } from 'express';

// The caller's ERP login (`Authorization: Bearer <token>` from POST /auth/login on the ERP), passed
// through untouched. The token says who the user is; the ERP loads their role, hierarchy nodes,
// overrides and field rules from its DB, so every call here sees exactly what that user may see.
export function bearerFrom(request: Request): string {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) throw new UnauthorizedException();
  return authorization;
}

// Fields are only present when the caller may see them (the ERP leaves hidden columns out).
export interface ErpProduct {
  id: number;
  sku?: string;
  name?: string;
  price?: string;
  currency?: string;
  stockQty?: number;
  availability?: boolean;
  cost?: string;
}

export interface ErpUser {
  id: number;
  email: string;
}

// Client for the ERP, treated as a third-party HTTP service.
@Injectable()
export class VendorErpService {
  private readonly http: AxiosInstance = axios.create({
    baseURL: process.env.ERP_BASE_URL ?? 'http://localhost:3006',
    timeout: 5_000,
  });

  fetchVendorProducts = (authorization: string, sku: string) =>
    this.call<ErpProduct>(() =>
      this.http.get(`/products/sku/${encodeURIComponent(sku)}`, {
        headers: { authorization },
      }),
    );

  // 409 when fewer than `qty` are in stock. Read-only, so it is safe to call for every item first.
  checkProductsQtyAvailability = (
    authorization: string,
    { sku, qty }: { sku: string; qty: number },
  ) =>
    this.call<ErpProduct>(() =>
      this.http.get(`/products/availability/${encodeURIComponent(sku)}/qty/${qty}`, {
        headers: { authorization },
      }),
    );

  // `stockQuantity` is the amount to deduct, not the new stock level. Atomic in the ERP: a 409
  // instead of overselling, even if stock changed after the availability check.
  updateVendorProducts = (authorization: string, { sku, qty }: { sku: string; qty: number }) =>
    this.call<ErpProduct>(() =>
      this.http.patch(
        `/products/${encodeURIComponent(sku)}/stock`,
        { stockQuantity: qty },
        { headers: { authorization } },
      ),
    );

  fetchCurrentUser = (authorization: string) =>
    this.call<ErpUser>(() => this.http.get('/auth/me', { headers: { authorization } }));

  private async call<T>(send: () => Promise<{ data: T }>): Promise<T> {
    try {
      return (await send()).data;
    } catch (error) {
      if (!isAxiosError(error)) throw error;
      const { response } = error;
      // 4xx (auth, permission, not found, out of stock) is the caller's problem: pass it through as is.
      if (response && response.status < 500) {
        throw new HttpException(response.data ?? response.statusText, response.status);
      }
      throw new BadGatewayException(response ? 'ERP request failed' : 'ERP is unreachable');
    }
  }
}
