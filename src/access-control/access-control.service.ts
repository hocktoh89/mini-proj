import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AssignRoleDto } from './dto/assign-role.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

// Roles are addressed by code and returned without their BigInt id, which JSON can't serialize.
const roleSelect = {
  code: true,
  name: true,
  description: true,
  level: true,
  isSystemRole: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  rolePermissions: {
    select: { permission: { select: { code: true } } },
    orderBy: { permission: { code: 'asc' } },
  },
  _count: { select: { userRoles: true } },
} satisfies Prisma.RoleSelect;

const userSelect = {
  id: true,
  email: true,
  username: true,
  status: true,
  organizationId: true,
  userRole: { select: { role: { select: { code: true, name: true } } } },
} satisfies Prisma.UserSelect;

type RoleRow = Prisma.RoleGetPayload<{ select: typeof roleSelect }>;

// Privilege rule used throughout: an admin may only create, edit or hand out a role whose
// permissions they hold themselves, and may never change their own role. That stops a lower admin
// from escalating, demoting a more senior admin, or locking themselves out.
@Injectable()
export class AccessControlService {
  constructor(private prisma: PrismaService) {}

  listPermissions() {
    return this.prisma.permission.findMany({
      select: {
        code: true,
        name: true,
        description: true,
        category: true,
        type: true,
        riskLevel: true,
        status: true,
      },
      orderBy: [{ category: 'asc' }, { code: 'asc' }],
    });
  }

  async listRoles() {
    const roles = await this.prisma.role.findMany({
      select: roleSelect,
      orderBy: [{ level: 'asc' }, { code: 'asc' }],
    });
    return roles.map(toRoleView);
  }

  async createRole(actorId: number, dto: CreateRoleDto) {
    const permissionIds = await this.permissionIdsFor(dto.permissionCodes);
    await this.assertMayGrant(actorId, dto.permissionCodes);
    try {
      const role = await this.prisma.role.create({
        data: {
          code: dto.code,
          name: dto.name,
          description: dto.description,
          level: dto.level,
          isSystemRole: false,
          rolePermissions: { create: permissionIds.map((permissionId) => ({ permissionId })) },
        },
        select: roleSelect,
      });
      return toRoleView(role);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Role code is already taken');
      }
      throw e;
    }
  }

  async updateRole(actorId: number, code: string, dto: UpdateRoleDto) {
    const role = await this.manageableRole(actorId, code);
    const updated = await this.prisma.role.update({
      where: { id: role.id },
      data: { name: dto.name, description: dto.description, level: dto.level, status: dto.status },
      select: roleSelect,
    });
    return toRoleView(updated);
  }

  // Replaces the role's permission set. Takes effect on every holder's next request.
  async setRolePermissions(actorId: number, code: string, permissionCodes: string[]) {
    const permissionIds = await this.permissionIdsFor(permissionCodes);
    const role = await this.manageableRole(actorId, code);
    await this.assertMayGrant(actorId, permissionCodes);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({
        where: { roleId: role.id, permissionId: { notIn: permissionIds } },
      });
      await tx.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
        skipDuplicates: true,
      });
      return tx.role.findUniqueOrThrow({ where: { id: role.id }, select: roleSelect });
    });
    return toRoleView(updated);
  }

  async listUsers() {
    const users = await this.prisma.user.findMany({ select: userSelect, orderBy: { id: 'asc' } });
    return users.map(toUserView);
  }

  // Gives the user `roleCode`, replacing any role they had (a user has at most one).
  async assignRole(actorId: number, userId: number, dto: AssignRoleDto) {
    const role = await this.prisma.role.findUnique({
      where: { code: dto.roleCode },
      select: {
        id: true,
        status: true,
        rolePermissions: { select: { permission: { select: { code: true } } } },
      },
    });
    if (!role || role.status !== 'active') throw new BadRequestException('Unknown role');
    await this.assertMayChangeUser(actorId, userId);
    await this.assertMayGrant(
      actorId,
      role.rolePermissions.map((rp) => rp.permission.code),
    );

    await this.prisma.userRole.upsert({
      where: { userId },
      update: { roleId: role.id },
      create: { userId, roleId: role.id },
    });
    return this.getUser(userId);
  }

  async removeRole(actorId: number, userId: number) {
    await this.assertMayChangeUser(actorId, userId);
    await this.prisma.userRole.deleteMany({ where: { userId } });
  }

  private async getUser(userId: number) {
    return toUserView(
      await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: userSelect }),
    );
  }

  // The target must exist, must not be the actor, and its current role must be within the actor's
  // permissions (otherwise a lower admin could demote a more senior one). Also used by the
  // hierarchy module before changing where a user is placed.
  async assertMayChangeUser(actorId: number, userId: number) {
    if (userId === actorId) throw new ForbiddenException('You cannot change your own access');
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        userRole: {
          select: {
            role: {
              select: { rolePermissions: { select: { permission: { select: { code: true } } } } },
            },
          },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    await this.assertMayGrant(
      actorId,
      user.userRole?.role.rolePermissions.map((rp) => rp.permission.code) ?? [],
    );
  }

  private async manageableRole(actorId: number, code: string) {
    const role = await this.prisma.role.findUnique({
      where: { code },
      select: {
        id: true,
        userRoles: { where: { userId: actorId }, select: { id: true } },
        rolePermissions: { select: { permission: { select: { code: true } } } },
      },
    });
    if (!role) throw new NotFoundException('Role not found');
    if (role.userRoles.length) throw new ForbiddenException('You cannot change your own role');
    await this.assertMayGrant(
      actorId,
      role.rolePermissions.map((rp) => rp.permission.code),
    );
    return role;
  }

  private async assertMayGrant(actorId: number, permissionCodes: string[]) {
    const owned = await this.permissionCodesOf(actorId);
    const missing = permissionCodes.filter((code) => !owned.has(code));
    if (missing.length) {
      throw new ForbiddenException(
        `You can only grant permissions you hold yourself (missing: ${missing.join(', ')})`,
      );
    }
  }

  // Every permission on the actor's role, inactive ones included: an inactive permission grants
  // nothing, so handing it on is harmless, and the role holder may still manage it.
  private async permissionCodesOf(userId: number): Promise<Set<string>> {
    const userRole = await this.prisma.userRole.findUnique({
      where: { userId },
      select: {
        role: {
          select: {
            status: true,
            rolePermissions: { select: { permission: { select: { code: true } } } },
          },
        },
      },
    });
    if (!userRole || userRole.role.status !== 'active') return new Set();
    return new Set(userRole.role.rolePermissions.map((rp) => rp.permission.code));
  }

  private async permissionIdsFor(codes: string[]): Promise<bigint[]> {
    const permissions = await this.prisma.permission.findMany({
      where: { code: { in: codes } },
      select: { id: true, code: true },
    });
    if (permissions.length !== codes.length) {
      const known = new Set(permissions.map((p) => p.code));
      const unknown = codes.filter((code) => !known.has(code));
      throw new BadRequestException(`Unknown permissions: ${unknown.join(', ')}`);
    }
    return permissions.map((p) => p.id);
  }
}

function toRoleView({ rolePermissions, _count, ...role }: RoleRow) {
  return {
    ...role,
    permissions: rolePermissions.map((rp) => rp.permission.code),
    userCount: _count.userRoles,
  };
}

function toUserView({ userRole, ...user }: Prisma.UserGetPayload<{ select: typeof userSelect }>) {
  return { ...user, role: userRole?.role ?? null };
}
