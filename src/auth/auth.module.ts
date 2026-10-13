import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { PermissionsGuard } from './auth.permissions.guard';
import { AuthService } from './auth.service';

@Module({
  // Secrets/TTLs are passed per call since access and refresh tokens use different ones.
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    // Applied to every route; order matters - AuthGuard sets request.user for PermissionsGuard.
    // Opt out with @Public(), require permissions with @RequirePermissions('code', ...).
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AuthModule {}
