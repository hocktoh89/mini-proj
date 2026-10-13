import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { apiKeyMatches, parseApiKeyPrefix } from './api-key';
import { AuthenticatedRequest, AuthUser, IS_PUBLIC_KEY } from './auth.decorators';
import { TokenPayload } from './auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private jwt: JwtService,
    private reflector: Reflector,
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = request.headers['x-api-key'];
    if (typeof apiKey === 'string') {
      (request as AuthenticatedRequest).user = await this.authenticateApiKey(request, apiKey);
      return true;
    }

    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException();

    let payload: TokenPayload;
    try {
      payload = await this.jwt.verifyAsync<TokenPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new UnauthorizedException();
    }

    // Check the session is still live so logout / refresh-token revocation / deactivating the user
    // take effect immediately instead of after the access token expires.
    const session = await this.prisma.refreshToken.findUnique({
      where: { id: payload.sid },
      select: { userId: true, revokedAt: true, user: { select: { status: true } } },
    });
    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt ||
      session.user.status !== 'active'
    ) {
      throw new UnauthorizedException();
    }

    (request as AuthenticatedRequest).user = {
      kind: 'session',
      id: payload.sub,
      sessionId: payload.sid,
    } satisfies AuthUser;
    return true;
  }

  // Third-party clients. Checked on every request (like sessions above) so suspending a client,
  // expiring it or deactivating its user in the DB takes effect on the next call.
  private async authenticateApiKey(request: Request, key: string): Promise<AuthUser> {
    const keyPrefix = parseApiKeyPrefix(key);
    if (!keyPrefix) throw new UnauthorizedException();

    const client = await this.prisma.apiClient.findUnique({
      where: { keyPrefix },
      select: {
        id: true,
        userId: true,
        keyHash: true,
        status: true,
        allowedIps: true,
        expiresAt: true,
        lastUsedAt: true,
        user: { select: { status: true } },
      },
    });
    const now = new Date();
    if (
      !client ||
      !apiKeyMatches(key, client.keyHash) ||
      client.status !== 'active' ||
      (client.expiresAt && client.expiresAt <= now) ||
      client.user.status !== 'active' ||
      (client.allowedIps.length > 0 && !client.allowedIps.includes(clientIp(request)))
    ) {
      throw new UnauthorizedException();
    }

    // Throttled so a busy client doesn't turn every read into a write.
    if (!client.lastUsedAt || now.getTime() - client.lastUsedAt.getTime() > 60_000) {
      void this.prisma.apiClient
        .update({ where: { id: client.id }, data: { lastUsedAt: now } })
        .catch(() => undefined);
    }

    return { kind: 'apiClient', id: client.userId, clientId: client.id };
  }

  // Bearer header (API clients / Swagger) first, then the httpOnly cookie (browser frontend).
  private extractToken(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    if (type === 'Bearer' && token) return token;
    const cookies = request.cookies as Record<string, string | undefined>;
    return cookies[this.config.getOrThrow<string>('ACCESS_TOKEN_COOKIE_NAME')];
  }
}

// Behind a reverse proxy, enable Express 'trust proxy' so request.ip is the real client address.
function clientIp(request: Request): string {
  return (request.ip ?? '').replace(/^::ffff:/, '');
}
