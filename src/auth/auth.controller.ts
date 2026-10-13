import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { CookieOptions, Request, Response } from 'express';
import { AuthUser, CurrentUser, Public } from './auth.decorators';
import { AuthService, IssuedTokens } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { tokens, user } = await this.authService.login(dto);
    this.setAuthCookies(res, tokens);
    return { accessToken: tokens.accessToken, expiresAt: tokens.accessExpiresAt, user };
  }

  @Public()
  @ApiCookieAuth()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cookies = req.cookies as Record<string, string | undefined>;
    const refreshToken = cookies[this.config.getOrThrow<string>('REFRESH_TOKEN_COOKIE_NAME')];
    try {
      const tokens = await this.authService.refresh(refreshToken);
      this.setAuthCookies(res, tokens);
      return { accessToken: tokens.accessToken, expiresAt: tokens.accessExpiresAt };
    } catch (e) {
      this.clearAuthCookies(res);
      throw e;
    }
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(user.sessionId);
    this.clearAuthCookies(res);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.authService.me(user.id);
  }

  private cookieOptions(path: string): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get('AUTH_COOKIE_SECURE') === 'true',
      sameSite: 'lax',
      path,
    };
  }

  private setAuthCookies(res: Response, tokens: IssuedTokens) {
    res.cookie(this.config.getOrThrow<string>('ACCESS_TOKEN_COOKIE_NAME'), tokens.accessToken, {
      ...this.cookieOptions('/'),
      expires: tokens.accessExpiresAt,
    });
    // Scoped to /auth so the refresh token is only ever sent to the refresh/logout endpoints.
    res.cookie(this.config.getOrThrow<string>('REFRESH_TOKEN_COOKIE_NAME'), tokens.refreshToken, {
      ...this.cookieOptions('/auth'),
      expires: tokens.refreshExpiresAt,
    });
  }

  private clearAuthCookies(res: Response) {
    res.clearCookie(
      this.config.getOrThrow<string>('ACCESS_TOKEN_COOKIE_NAME'),
      this.cookieOptions('/'),
    );
    res.clearCookie(
      this.config.getOrThrow<string>('REFRESH_TOKEN_COOKIE_NAME'),
      this.cookieOptions('/auth'),
    );
  }
}
