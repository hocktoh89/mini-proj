import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccessControlService } from '../access-control/access-control.service';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNodeDto } from './dto/create-node.dto';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { SetUserHierarchyDto } from './dto/set-user-hierarchy.dto';
import { UpdateNodeDto } from './dto/update-node.dto';

const levelSelect = { id: true, levelNo: true, name: true } satisfies Prisma.HierarchyLevelSelect;

const organizationSelect = {
  id: true,
  name: true,
  levels: { select: levelSelect, orderBy: { levelNo: 'asc' } },
  _count: { select: { users: true } },
} satisfies Prisma.OrganizationSelect;

const nodeSelect = {
  id: true,
  name: true,
  parentId: true,
  level: { select: { ...levelSelect, organizationId: true } },
  _count: { select: { users: true, children: true } },
} satisfies Prisma.HierarchyNodeSelect;

type OrganizationRow = Prisma.OrganizationGetPayload<{ select: typeof organizationSelect }>;
type NodeRow = Prisma.HierarchyNodeGetPayload<{ select: typeof nodeSelect }>;

export interface TreeNode {
  id: number;
  name: string;
  levelNo: number;
  levelName: string;
  userCount: number;
  children: TreeNode[];
}

// Levels are append-only at the bottom and nodes take their level from their parent, so the tree
// always satisfies the hierarchyNodes_level_check trigger. Deletes refuse anything still in use
// rather than cascading, because cascades here would silently change what users can see.
@Injectable()
export class HierarchyService {
  constructor(
    private prisma: PrismaService,
    private accessControl: AccessControlService,
  ) {}

  // ---- Organizations

  async listOrganizations() {
    const orgs = await this.prisma.organization.findMany({
      select: organizationSelect,
      orderBy: { name: 'asc' },
    });
    return orgs.map(toOrganizationView);
  }

  async createOrganization(dto: CreateOrganizationDto) {
    const org = await this.prisma.organization
      .create({
        data: {
          name: dto.name,
          levels: { create: (dto.levels ?? []).map((name, i) => ({ levelNo: i + 1, name })) },
        },
        select: organizationSelect,
      })
      .catch(conflictIfTaken('Organization name is already taken'));
    return toOrganizationView(org);
  }

  async renameOrganization(id: number, name: string) {
    const org = await this.prisma.organization
      .update({ where: { id }, data: { name }, select: organizationSelect })
      .catch(notFoundIfMissing('Organization'))
      .catch(conflictIfTaken('Organization name is already taken'));
    return toOrganizationView(org);
  }

  async deleteOrganization(id: number) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      select: { _count: { select: { users: true } } },
    });
    if (!org) throw new NotFoundException('Organization not found');
    const nodes = await this.prisma.hierarchyNode.count({
      where: { level: { organizationId: id } },
    });
    if (org._count.users || nodes) {
      throw new ConflictException(
        `Organization still has ${org._count.users} user(s) and ${nodes} node(s)`,
      );
    }
    await this.prisma.organization.delete({ where: { id } });
  }

  // Levels and the node tree, nested from the top nodes down.
  async getTree(organizationId: number) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: organizationSelect,
    });
    if (!org) throw new NotFoundException('Organization not found');
    const nodes = await this.prisma.hierarchyNode.findMany({
      where: { level: { organizationId } },
      select: nodeSelect,
      orderBy: { name: 'asc' },
    });

    const byId = new Map<number, TreeNode>(
      nodes.map((n) => [
        n.id,
        {
          id: n.id,
          name: n.name,
          levelNo: n.level.levelNo,
          levelName: n.level.name,
          userCount: n._count.users,
          children: [],
        },
      ]),
    );
    const roots: TreeNode[] = [];
    for (const n of nodes) {
      const view = byId.get(n.id)!;
      if (n.parentId === null) roots.push(view);
      else byId.get(n.parentId)?.children.push(view);
    }
    return { ...toOrganizationView(org), nodes: roots };
  }

  // ---- Levels

  async addLevel(organizationId: number, name: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { levels: { select: { levelNo: true }, orderBy: { levelNo: 'desc' }, take: 1 } },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return this.prisma.hierarchyLevel
      .create({
        data: { organizationId, name, levelNo: (org.levels[0]?.levelNo ?? 0) + 1 },
        select: levelSelect,
      })
      .catch(
        conflictIfTaken('Level name is taken in this organization, or a level was just added'),
      );
  }

  renameLevel(id: number, name: string) {
    return this.prisma.hierarchyLevel
      .update({ where: { id }, data: { name }, select: levelSelect })
      .catch(notFoundIfMissing('Level'))
      .catch(conflictIfTaken('Level name is taken in this organization'));
  }

  // Only the bottom level can go, and only while it has no nodes and no field rules.
  async deleteLevel(id: number) {
    const level = await this.prisma.hierarchyLevel.findUnique({
      where: { id },
      select: {
        organizationId: true,
        levelNo: true,
        _count: { select: { nodes: true, fieldPermissions: true } },
      },
    });
    if (!level) throw new NotFoundException('Level not found');
    const deeper = await this.prisma.hierarchyLevel.count({
      where: { organizationId: level.organizationId, levelNo: { gt: level.levelNo } },
    });
    if (deeper) throw new ConflictException('Only the bottom level can be deleted');
    if (level._count.nodes || level._count.fieldPermissions) {
      throw new ConflictException(
        `Level still has ${level._count.nodes} node(s) and ${level._count.fieldPermissions} field rule(s)`,
      );
    }
    await this.prisma.hierarchyLevel.delete({ where: { id } });
  }

  // ---- Nodes

  async createNode(dto: CreateNodeDto) {
    let organizationId: number;
    let levelNo: number;
    if (dto.parentId === undefined) {
      if (dto.organizationId === undefined) {
        throw new BadRequestException('A top node needs organizationId');
      }
      organizationId = dto.organizationId;
      levelNo = 1;
    } else {
      const parent = await this.findNode(dto.parentId, 'Parent node');
      if (dto.organizationId !== undefined && dto.organizationId !== parent.level.organizationId) {
        throw new BadRequestException('Parent node belongs to a different organization');
      }
      organizationId = parent.level.organizationId;
      levelNo = parent.level.levelNo + 1;
    }

    const level = await this.prisma.hierarchyLevel.findUnique({
      where: { organizationId_levelNo: { organizationId, levelNo } },
      select: { id: true },
    });
    if (!level) {
      throw new BadRequestException(
        `Organization ${organizationId} has no level ${levelNo}; add the level first`,
      );
    }
    const node = await this.prisma.hierarchyNode.create({
      data: { name: dto.name, levelId: level.id, parentId: dto.parentId ?? null },
      select: nodeSelect,
    });
    return toNodeView(node);
  }

  // A move keeps the node (and its subtree) at the same depth, so the new parent must sit at the
  // same level as the old one.
  async updateNode(id: number, dto: UpdateNodeDto) {
    const node = await this.findNode(id, 'Node');
    if (dto.parentId !== undefined && dto.parentId !== node.parentId) {
      if (node.parentId === null) throw new BadRequestException('A top node cannot be moved');
      const parent = await this.findNode(dto.parentId, 'Parent node');
      if (
        parent.level.organizationId !== node.level.organizationId ||
        parent.level.levelNo !== node.level.levelNo - 1
      ) {
        throw new BadRequestException(
          `New parent must be a level ${node.level.levelNo - 1} node in the same organization`,
        );
      }
    }
    const updated = await this.prisma.hierarchyNode.update({
      where: { id },
      data: { name: dto.name, parentId: dto.parentId },
      select: nodeSelect,
    });
    return toNodeView(updated);
  }

  async deleteNode(id: number) {
    const node = await this.prisma.hierarchyNode.findUnique({
      where: { id },
      select: { _count: { select: { children: true, users: true, tags: true, blocks: true } } },
    });
    if (!node) throw new NotFoundException('Node not found');
    const { children, users, tags, blocks } = node._count;
    if (children || users || tags || blocks) {
      throw new ConflictException(
        `Node still has ${children} child node(s), ${users} user(s), ${tags} product tag(s) and ${blocks} block(s)`,
      );
    }
    await this.prisma.hierarchyNode.delete({ where: { id } });
  }

  // ---- User placement

  async getUserHierarchy(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        organization: { select: { id: true, name: true } },
        hierarchyNodes: { select: { node: { select: nodeSelect } }, orderBy: { nodeId: 'asc' } },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    const nodes = await Promise.all(
      user.hierarchyNodes.map(async ({ node }) => ({
        ...toNodeView(node),
        path: await this.pathOf(node.id),
      })),
    );
    return { userId: user.id, organization: user.organization, nodes };
  }

  // Replaces the user's organization and node set. Takes effect on their next catalog request.
  async setUserHierarchy(actorId: number, userId: number, dto: SetUserHierarchyDto) {
    await this.accessControl.assertMayChangeUser(actorId, userId);
    if (dto.organizationId === null) {
      if (dto.nodeIds.length) throw new BadRequestException('Nodes need an organization');
    } else {
      const org = await this.prisma.organization.count({ where: { id: dto.organizationId } });
      if (!org) throw new BadRequestException('Unknown organization');
      const nodes = await this.prisma.hierarchyNode.count({
        where: { id: { in: dto.nodeIds }, level: { organizationId: dto.organizationId } },
      });
      if (nodes !== dto.nodeIds.length) {
        throw new BadRequestException('Every node must belong to the organization');
      }
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { organizationId: dto.organizationId },
      }),
      this.prisma.userHierarchyNode.deleteMany({
        where: { userId, nodeId: { notIn: dto.nodeIds } },
      }),
      this.prisma.userHierarchyNode.createMany({
        data: dto.nodeIds.map((nodeId) => ({ userId, nodeId })),
        skipDuplicates: true,
      }),
    ]);
    return this.getUserHierarchy(userId);
  }

  // Node names from the top down, e.g. ['Furniture', 'Malaysia', "John's Territory"].
  private async pathOf(nodeId: number): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ name: string }[]>`
      WITH RECURSIVE up AS (
        SELECT id, "parentId", name, 0 AS depth FROM "hierarchyNodes" WHERE id = ${nodeId}
        UNION ALL
        SELECT p.id, p."parentId", p.name, u.depth + 1
        FROM up u JOIN "hierarchyNodes" p ON p.id = u."parentId"
      )
      SELECT name FROM up ORDER BY depth DESC`;
    return rows.map((r) => r.name);
  }

  private async findNode(id: number, label: string) {
    const node = await this.prisma.hierarchyNode.findUnique({
      where: { id },
      select: {
        parentId: true,
        level: { select: { organizationId: true, levelNo: true } },
      },
    });
    if (!node) throw new NotFoundException(`${label} not found`);
    return node;
  }
}

function toOrganizationView({ _count, ...org }: OrganizationRow) {
  return { ...org, userCount: _count.users };
}

function toNodeView({ level, _count, ...node }: NodeRow) {
  return {
    ...node,
    organizationId: level.organizationId,
    level: { id: level.id, levelNo: level.levelNo, name: level.name },
    userCount: _count.users,
    childCount: _count.children,
  };
}

function notFoundIfMissing(label: string) {
  return (e: unknown): never => {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      throw new NotFoundException(`${label} not found`);
    }
    throw e;
  };
}

function conflictIfTaken(message: string) {
  return (e: unknown): never => {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new ConflictException(message);
    }
    throw e;
  };
}
