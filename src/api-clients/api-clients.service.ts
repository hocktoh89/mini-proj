import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'crypto';
import { Prisma } from '../generated/prisma/client';
import { generateApiKey } from '../auth/api-key';
import { PrismaService } from '../prisma/prisma.service';
import { CreateApiClientDto } from './dto/create-api-client.dto';
import { UpdateApiClientDto } from './dto/update-api-client.dto';

const apiClientSelect = {
  id: true,
  name: true,
  userId: true,
  keyPrefix: true,
  status: true,
  allowedIps: true,
  expiresAt: true,
  lastUsedAt: true,
  createdAt: true,
  user: {
    select: {
      organizationId: true,
      userRole: { select: { role: { select: { code: true } } } },
      hierarchyNodes: { select: { nodeId: true } },
    },
  },
} satisfies Prisma.ApiClientSelect;

@Injectable()
export class ApiClientsService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.apiClient.findMany({ select: apiClientSelect, orderBy: { id: 'asc' } });
  }

  // Creates the service-account user (role + nodes) and the client. The raw key is returned only here.
  async create(dto: CreateApiClientDto) {
    const role = await this.prisma.role.findUnique({ where: { code: dto.roleCode } });
    if (!role || role.status !== 'active') throw new BadRequestException('Unknown role');

    const nodeCount = await this.prisma.hierarchyNode.count({
      where: { id: { in: dto.nodeIds }, level: { organizationId: dto.organizationId } },
    });
    if (nodeCount !== dto.nodeIds.length) {
      throw new BadRequestException('Every node must belong to the organization');
    }

    const apiKey = generateApiKey();
    // Nobody knows this password, so the service account can't log in through /auth/login.
    const password = await bcrypt.hash(randomBytes(32).toString('hex'), 12);

    const client = await this.prisma.apiClient.create({
      data: {
        name: dto.name,
        keyPrefix: apiKey.prefix,
        keyHash: apiKey.hash,
        allowedIps: dto.allowedIps ?? [],
        expiresAt: dto.expiresAt,
        user: {
          create: {
            email: `api-client+${randomUUID()}@clients.invalid`,
            username: dto.name,
            password,
            organizationId: dto.organizationId,
            userRole: { create: { roleId: role.id } },
            hierarchyNodes: { create: dto.nodeIds.map((nodeId) => ({ nodeId })) },
          },
        },
      },
      select: apiClientSelect,
    });
    return { client, apiKey: apiKey.key };
  }

  // Setting status to 'suspended' or 'revoked' blocks the client on its next request.
  update(id: number, dto: UpdateApiClientDto) {
    return this.prisma.apiClient
      .update({
        where: { id },
        data: { status: dto.status, allowedIps: dto.allowedIps, expiresAt: dto.expiresAt },
        select: apiClientSelect,
      })
      .catch(notFoundIfMissing);
  }

  // The old key stops working immediately.
  async rotateKey(id: number) {
    const apiKey = generateApiKey();
    const client = await this.prisma.apiClient
      .update({
        where: { id },
        data: { keyPrefix: apiKey.prefix, keyHash: apiKey.hash },
        select: apiClientSelect,
      })
      .catch(notFoundIfMissing);
    return { client, apiKey: apiKey.key };
  }
}

function notFoundIfMissing(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
    throw new NotFoundException();
  }
  throw e;
}
