import {
  BadGatewayException,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import axios, { AxiosInstance, isAxiosError } from 'axios';
import type { Request } from 'express';

// The caller's ERP login, passed through untouched. The portal holds no credentials of its own,
// so the ERP's role permissions, hierarchy (row) and field (column) rules apply to every call.
export interface ErpCredentials {
  authorization?: string;
  apiKey?: string;
  cookie?: string;
}

export function credentialsFrom(request: Request): ErpCredentials {
  const header = (name: string) => {
    const value = request.headers[name];
    return typeof value === 'string' && value ? value : undefined;
  };
  return {
    authorization: header('authorization'),
    apiKey: header('x-api-key'),
    cookie: header('cookie'),
  };
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

  fetchVendorProducts = (credentials: ErpCredentials, sku: string) =>
    this.call<ErpProduct>(() =>
      this.http.get(`/products/sku/${encodeURIComponent(sku)}`, {
        headers: this.headers(credentials),
      }),
    );

  // Atomic in the ERP: fails with 409 instead of overselling, so no separate availability check.
  // `stockQuantity` is the amount to deduct, not the new stock level.
  updateVendorProducts = (
    credentials: ErpCredentials,
    { sku, qty }: { sku: string; qty: number },
  ) =>
    this.call<ErpProduct>(() =>
      this.http.patch(
        `/products/${encodeURIComponent(sku)}/stock`,
        { stockQuantity: qty },
        { headers: this.headers(credentials) },
      ),
    );

  fetchCurrentUser = (credentials: ErpCredentials) =>
    this.call<ErpUser>(() => this.http.get('/auth/me', { headers: this.headers(credentials) }));

  private headers(credentials: ErpCredentials) {
    if (!credentials.authorization && !credentials.apiKey && !credentials.cookie) {
      throw new UnauthorizedException();
    }
    const headers: Record<string, string> = {};
    if (credentials.authorization) headers.authorization = credentials.authorization;
    if (credentials.apiKey) headers['x-api-key'] = credentials.apiKey;
    if (credentials.cookie) headers.cookie = credentials.cookie;
    return headers;
  }

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
