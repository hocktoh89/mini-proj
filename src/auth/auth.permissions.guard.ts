import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedRequest, PERMISSIONS_KEY } from './auth.decorators';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true; // route doesn't need permissions

    const { user } = context.switchToHttp().getRequest<Partial<AuthenticatedRequest>>();
    if (!user) throw new ForbiddenException();

    const userRole = await this.prisma.userRole.findUnique({
      where: { userId: user.id },
      include: {
        role: {
          include: {
            rolePermissions: {
              where: { permission: { status: 'active' } },
              include: { permission: true },
            },
          },
        },
      },
    });

    if (!userRole || userRole.role.status !== 'active') throw new ForbiddenException();

    const owned = new Set(userRole.role.rolePermissions.map((rp) => rp.permission.code));
    if (!required.every((code) => owned.has(code))) throw new ForbiddenException();
    return true;
  }
}
