import type { Request } from 'express';
import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const PERMISSIONS_KEY = 'permissions';
export const RequirePermissions = (...codes: string[]) => SetMetadata(PERMISSIONS_KEY, codes);

// Set on the request by AuthGuard. `id` is always a User id: API clients act as their
// service-account user, so permission and hierarchy checks treat both kinds the same.
export type AuthUser =
  | { kind: 'session'; id: number; sessionId: string }
  | { kind: 'apiClient'; id: number; clientId: number };

export type AuthenticatedRequest = Request & { user: AuthUser };

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
