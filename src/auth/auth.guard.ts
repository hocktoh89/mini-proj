import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
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
      id: payload.sub,
      sessionId: payload.sid,
    } satisfies AuthUser;
    return true;
  }

  // Bearer header (Swagger, curl, portal-api) first, then the httpOnly cookie (browser frontend).
  private extractToken(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    if (type === 'Bearer' && token) return token;
    const cookies = request.cookies as Record<string, string | undefined>;
    return cookies[this.config.getOrThrow<string>('ACCESS_TOKEN_COOKIE_NAME')];
  }
}
