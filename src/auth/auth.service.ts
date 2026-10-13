import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'crypto';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

export interface TokenPayload {
  sub: number;
  sid: string; // RefreshToken.id of the session this token belongs to
}

export interface IssuedTokens {
  sessionId: string;
  accessToken: string;
  accessExpiresAt: Date;
  refreshToken: string;
  refreshExpiresAt: Date;
}

const BCRYPT_ROUNDS = 12;
// Compared against when the email is unknown, so login timing doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('dummy-password', BCRYPT_ROUNDS);

const publicUserSelect = {
  id: true,
  email: true,
  username: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const password = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    try {
      return await this.prisma.user.create({
        data: { email: dto.email.toLowerCase(), username: dto.username, password },
        select: publicUserSelect,
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Email is already registered');
      }
      throw e;
    }
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    const valid = await bcrypt.compare(dto.password, user?.password ?? DUMMY_HASH);
    if (!user || !valid || user.status !== 'active') {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.prisma.$transaction(async (tx) => {
      // Single session per user: revoke any prior active session before creating a new one.
      await tx.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      return this.createSession(tx, user.id);
    });

    return { tokens, user: await this.me(user.id) };
  }

  async refresh(refreshToken: string | undefined): Promise<IssuedTokens> {
    if (!refreshToken) throw new UnauthorizedException();

    let payload: TokenPayload;
    try {
      payload = await this.jwt.verifyAsync<TokenPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException();
    }

    const session = await this.prisma.refreshToken.findUnique({
      where: { id: payload.sid },
      include: { user: { select: { status: true } } },
    });
    if (
      !session ||
      session.userId !== payload.sub ||
      session.tokenHash !== hashToken(refreshToken)
    ) {
      throw new UnauthorizedException();
    }

    if (session.revokedAt) {
      // A rotated-out token being replayed means it was likely stolen: kill every session.
      if (session.replacedByTokenId) await this.revokeAllSessions(session.userId);
      throw new UnauthorizedException();
    }
    if (session.expiresAt <= new Date() || session.user.status !== 'active') {
      throw new UnauthorizedException();
    }

    return this.prisma.$transaction(async (tx) => {
      const tokens = await this.createSession(tx, session.userId);
      const { count } = await tx.refreshToken.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: new Date(), replacedByTokenId: tokens.sessionId },
      });
      // Lost a race with a concurrent refresh/logout of the same token.
      if (count === 0) throw new UnauthorizedException();
      return tokens;
    });
  }

  async logout(sessionId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  me(userId: number) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        ...publicUserSelect,
        userRole: {
          select: {
            role: {
              select: {
                code: true,
                name: true,
                rolePermissions: {
                  where: { permission: { status: 'active' } },
                  select: { permission: { select: { code: true } } },
                },
              },
            },
          },
        },
      },
    });
  }

  private async revokeAllSessions(userId: number) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async createSession(tx: Prisma.TransactionClient, userId: number): Promise<IssuedTokens> {
    const payload: TokenPayload = { sub: userId, sid: randomUUID() };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.getOrThrow<JwtSignOptions['expiresIn']>('JWT_ACCESS_TTL'),
    });
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.getOrThrow<JwtSignOptions['expiresIn']>('JWT_REFRESH_TTL'),
    });
    const refreshExpiresAt = this.expiryOf(refreshToken);

    await tx.refreshToken.create({
      data: {
        id: payload.sid,
        userId,
        tokenHash: hashToken(refreshToken),
        expiresAt: refreshExpiresAt,
      },
    });

    return {
      sessionId: payload.sid,
      accessToken,
      accessExpiresAt: this.expiryOf(accessToken),
      refreshToken,
      refreshExpiresAt,
    };
  }

  private expiryOf(token: string): Date {
    return new Date(this.jwt.decode<{ exp: number }>(token).exp * 1000);
  }
}

// Refresh JWTs exceed bcrypt's 72-byte limit, and are already high-entropy, so SHA-256 is appropriate.
function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
