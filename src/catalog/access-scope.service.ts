import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CATALOG_ROWS_ALL } from './catalog.permissions';

// Everything about a user that row/field rules depend on, loaded once per request.
export interface AccessSubject {
  userId: number;
  roleId: bigint | null;
  seesAllRows: boolean;
  levelIds: number[]; // levels of the user's directly assigned nodes
}

export const PRODUCT_RESOURCE = 'product';

@Injectable()
export class AccessScopeService {
  constructor(private prisma: PrismaService) {}

  async loadSubject(userId: number): Promise<AccessSubject> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        userRole: {
          select: {
            roleId: true,
            role: {
              select: {
                status: true,
                rolePermissions: {
                  where: { permission: { code: CATALOG_ROWS_ALL, status: 'active' } },
                  select: { id: true },
                },
              },
            },
          },
        },
        hierarchyNodes: { select: { node: { select: { levelId: true } } } },
      },
    });
    const role = user.userRole?.role.status === 'active' ? user.userRole : null;
    return {
      userId,
      roleId: role?.roleId ?? null,
      seesAllRows: (role?.role.rolePermissions.length ?? 0) > 0,
      levelIds: [...new Set(user.hierarchyNodes.map((h) => h.node.levelId))],
    };
  }

  /**
   * Product ids the subject may see, in id order. Pass `productId` to check a single product.
   *
   * 1. Active DENY override        -> hidden (beats everything)
   * 2. Active ALLOW override       -> visible
   * 3. catalog.rows.all permission -> visible
   * 4. Hierarchy: tagged on one of the user's nodes, an ancestor, or a descendant -> visible,
   *    unless a node block sits on the user's node or above it (a block means "this node and
   *    everything below cannot see it"), or on the way down to the tag. Multiple assigned
   *    nodes are combined: visible through any one is enough.
   * 5. Otherwise hidden.
   */
  async visibleProductIds(subject: AccessSubject, productId?: number): Promise<number[]> {
    const rows = await this.prisma.$queryRaw<{ id: number }[]>`
      WITH RECURSIVE
      -- each assigned node (start) and all its ancestors, including itself
      up AS (
        SELECT uhn."nodeId" AS start, n.id AS "nodeId", n."parentId"
        FROM "userHierarchyNodes" uhn
        JOIN "hierarchyNodes" n ON n.id = uhn."nodeId"
        WHERE uhn."userId" = ${subject.userId}
        UNION ALL
        SELECT u.start, p.id, p."parentId"
        FROM up u
        JOIN "hierarchyNodes" p ON p.id = u."parentId"
      ),
      -- each assigned node and all its descendants, with the path walked to get there
      down AS (
        SELECT uhn."nodeId" AS start, uhn."nodeId", ARRAY[uhn."nodeId"] AS path
        FROM "userHierarchyNodes" uhn
        WHERE uhn."userId" = ${subject.userId}
        UNION ALL
        SELECT d.start, c.id, d.path || c.id
        FROM down d
        JOIN "hierarchyNodes" c ON c."parentId" = d."nodeId"
      ),
      reachable AS (
        SELECT start, "nodeId", ARRAY[]::int[] AS path FROM up
        UNION ALL
        SELECT start, "nodeId", path FROM down
      ),
      via_hierarchy AS (
        SELECT t."resourceId" AS id
        FROM reachable r
        JOIN "resourceNodeTags" t
          ON t."nodeId" = r."nodeId" AND t."resourceType" = ${PRODUCT_RESOURCE}
        WHERE NOT EXISTS (
          SELECT 1 FROM "nodeBlocks" b
          WHERE b."resourceType" = ${PRODUCT_RESOURCE}
            AND b."resourceId" = t."resourceId"
            AND (
              b."nodeId" = ANY(r.path)
              OR b."nodeId" IN (SELECT a."nodeId" FROM up a WHERE a.start = r.start)
            )
        )
      ),
      overrides AS (
        SELECT "resourceId" AS id, effect
        FROM "userOverrides"
        WHERE "userId" = ${subject.userId}
          AND "resourceType" = ${PRODUCT_RESOURCE}
          AND ("expiresAt" IS NULL OR "expiresAt" > now())
      )
      SELECT p.id
      FROM products p
      WHERE (${productId ?? null}::int IS NULL OR p.id = ${productId ?? null}::int)
        AND NOT EXISTS (SELECT 1 FROM overrides o WHERE o.id = p.id AND o.effect = 'DENY')
        AND (
          ${subject.seesAllRows}::boolean
          OR EXISTS (SELECT 1 FROM overrides o WHERE o.id = p.id AND o.effect = 'ALLOW')
          OR EXISTS (SELECT 1 FROM via_hierarchy v WHERE v.id = p.id)
        )
      ORDER BY p.id`;
    return rows.map((r) => r.id);
  }

  /**
   * Field names of `resourceType` the subject may see. A rule matches when its role (if set) is
   * the user's role and its level (if set) is one of the user's node levels. Any matching DENY
   * hides the field; otherwise any matching ALLOW shows it; otherwise defaultVisible decides.
   */
  async visibleFields(subject: AccessSubject, resourceType: string): Promise<Set<string>> {
    const roleMatch =
      subject.roleId === null ? [{ roleId: null }] : [{ roleId: null }, { roleId: subject.roleId }];
    const definitions = await this.prisma.fieldDefinition.findMany({
      where: { resourceType },
      select: {
        fieldName: true,
        defaultVisible: true,
        permissions: {
          where: {
            AND: [
              { OR: roleMatch },
              { OR: [{ levelId: null }, { levelId: { in: subject.levelIds } }] },
            ],
          },
          select: { allowed: true },
        },
      },
    });

    const visible = new Set<string>();
    for (const def of definitions) {
      const rules = def.permissions.map((p) => p.allowed);
      const allowed = rules.includes(false) ? false : rules.includes(true) || def.defaultVisible;
      if (allowed) visible.add(def.fieldName);
    }
    return visible;
  }
}
