// Dev seed: the worked example from requirementSchema/permission_hierarchy_simple.xlsx, plus two
// products (Sofa, Lamp) that exercise downward visibility. Idempotent - safe to run repeatedly.
//
//   npx prisma db seed
//
// Expected catalog visibility:
//   Alan  (CATALOG_ADMIN, no nodes)        Chair Table Cabinet Sofa Lamp   + cost
//   John  (John's Territory)               Chair       Cabinet Sofa        (Table: his DENY)
//   Ben   (Ben's Territory)                Chair Table                     (Cabinet: blocked at Singapore; Table: his ALLOW)
//   Aisha (Malaysia + Singapore)           Chair Table Cabinet Sofa        + cost (Country-level rule)
//   Lamp is tagged at John's Territory but blocked at Malaysia, so only Alan sees it.
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import { config } from 'dotenv';
import { createHash, randomBytes } from 'crypto';
import path from 'path';
import { OverrideEffect, PrismaClient } from '../src/generated/prisma/client';
import { buildApiKey } from '../src/auth/api-key';

const PERMISSIONS = [
  { code: 'catalog.read', name: 'Read catalog', riskLevel: 'low' },
  { code: 'catalog.rows.all', name: 'See every catalog row', riskLevel: 'high' },
  { code: 'apiClients.manage', name: 'Manage API clients', riskLevel: 'critical' },
] as const;

const ROLES = [
  {
    code: 'SUPER_ADMIN',
    name: 'Super admin',
    level: 1,
    permissions: PERMISSIONS.map((p) => p.code),
  },
  {
    code: 'CATALOG_ADMIN',
    name: 'Catalog admin',
    level: 2,
    permissions: ['catalog.read', 'catalog.rows.all'],
  },
  { code: 'CATALOG_STAFF', name: 'Catalog staff', level: 3, permissions: ['catalog.read'] },
];

export const SEED_ADMIN = { email: 'admin@example.com', password: 'ChangeMe123!' };

export async function seed(prisma: PrismaClient) {
  // Permissions and roles
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: {},
      create: { ...p, description: p.name, category: 'catalog', type: 'api' },
    });
  }
  const roles: Record<string, bigint> = {};
  for (const r of ROLES) {
    const role = await prisma.role.upsert({
      where: { code: r.code },
      update: {},
      create: { code: r.code, name: r.name, level: r.level },
    });
    roles[r.code] = role.id;
    for (const code of r.permissions) {
      const permission = await prisma.permission.findUniqueOrThrow({ where: { code } });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }

  // Organizations and their levels
  const org = async (name: string) =>
    prisma.organization.upsert({ where: { name }, update: {}, create: { name } });
  const level = async (organizationId: number, levelNo: number, name: string) =>
    prisma.hierarchyLevel.upsert({
      where: { organizationId_levelNo: { organizationId, levelNo } },
      update: { name },
      create: { organizationId, levelNo, name },
    });

  const aeon = await org('Aeon');
  const aeonBig = await org('Aeon Big');
  await org('MaxValue');
  const division = await level(aeon.id, 1, 'Division');
  const country = await level(aeon.id, 2, 'Country');
  const salesperson = await level(aeon.id, 3, 'Salesperson');
  for (const [no, name] of ['Brand', 'Channel', 'Account', 'Sub-account'].entries()) {
    await level(aeonBig.id, no + 1, name);
  }

  // Nodes (no natural unique key, so find-or-create)
  const node = async (levelId: number, parentId: number | null, name: string) =>
    (await prisma.hierarchyNode.findFirst({ where: { levelId, parentId, name } })) ??
    prisma.hierarchyNode.create({ data: { levelId, parentId, name } });
  const furniture = await node(division.id, null, 'Furniture');
  const malaysia = await node(country.id, furniture.id, 'Malaysia');
  const singapore = await node(country.id, furniture.id, 'Singapore');
  const johnsTerritory = await node(salesperson.id, malaysia.id, "John's Territory");
  const bensTerritory = await node(salesperson.id, singapore.id, "Ben's Territory");

  // Products and their field definitions (cost hidden unless a rule allows it)
  const product = async (
    sku: string,
    name: string,
    price: number,
    availability: number,
    cost: number,
  ) =>
    prisma.product.upsert({
      where: { sku },
      update: {},
      create: { sku, name, price, availability, cost },
    });
  const chair = await product('SKU-1001', 'Chair', 100, 60, 55);
  const table = await product('SKU-1002', 'Table', 60, 50, 35);
  const cabinet = await product('SKU-1003', 'Cabinet', 280, 30, 190);
  const sofa = await product('SKU-1004', 'Sofa', 900, 12, 600);
  const lamp = await product('SKU-1005', 'Lamp', 45, 80, 20);

  const fields: Record<string, number> = {};
  for (const [fieldName, defaultVisible] of [
    ['sku', true],
    ['name', true],
    ['price', true],
    ['availability', true],
    ['cost', false],
  ] as const) {
    const def = await prisma.fieldDefinition.upsert({
      where: { resourceType_fieldName: { resourceType: 'product', fieldName } },
      update: {},
      create: { resourceType: 'product', fieldName, defaultVisible },
    });
    fields[fieldName] = def.id;
  }

  // Tags and blocks
  const tag = async (resourceId: number, nodeId: number) =>
    prisma.resourceNodeTag.upsert({
      where: { resourceType_resourceId_nodeId: { resourceType: 'product', resourceId, nodeId } },
      update: {},
      create: { resourceType: 'product', resourceId, nodeId },
    });
  const block = async (resourceId: number, nodeId: number, reason: string) =>
    prisma.nodeBlock.upsert({
      where: { resourceType_resourceId_nodeId: { resourceType: 'product', resourceId, nodeId } },
      update: {},
      create: { resourceType: 'product', resourceId, nodeId, reason },
    });
  await tag(chair.id, furniture.id);
  await tag(table.id, malaysia.id);
  await tag(cabinet.id, furniture.id);
  await tag(sofa.id, johnsTerritory.id);
  await tag(lamp.id, johnsTerritory.id);
  await block(cabinet.id, singapore.id, 'Not sold in Singapore');
  await block(lamp.id, malaysia.id, 'Not certified in Malaysia');

  // Field rules: CATALOG_ADMIN may see cost; anyone assigned at Country level may see cost.
  const fieldRule = async (fieldId: number, roleId: bigint | null, levelId: number | null) =>
    (await prisma.fieldPermission.findFirst({ where: { fieldId, roleId, levelId } })) ??
    prisma.fieldPermission.create({ data: { fieldId, roleId, levelId, allowed: true } });
  await fieldRule(fields.cost, roles.CATALOG_ADMIN, null);
  await fieldRule(fields.cost, null, country.id);

  // Human admin who manages API clients through /api-clients
  const adminPassword = await bcrypt.hash(SEED_ADMIN.password, 12);
  const admin = await prisma.user.upsert({
    where: { email: SEED_ADMIN.email },
    update: {},
    create: { email: SEED_ADMIN.email, username: 'Admin', password: adminPassword },
  });
  await prisma.userRole.upsert({
    where: { userId: admin.id },
    update: {},
    create: { userId: admin.id, roleId: roles.SUPER_ADMIN },
  });

  // The spreadsheet's users, each as a third-party API client with a stable key. Their password is
  // random and discarded, so they can only authenticate with the API key.
  const unusablePassword = async () => bcrypt.hash(randomBytes(32).toString('hex'), 12);
  const apiKeys: Record<string, string> = {};
  const client = async (
    name: string,
    roleCode: string,
    nodeIds: number[],
    overrides: [number, OverrideEffect][] = [],
  ) => {
    const email = `${name.toLowerCase()}@clients.invalid`;
    const user = await prisma.user.upsert({
      where: { email },
      update: { password: await unusablePassword() },
      create: {
        email,
        username: name,
        password: await unusablePassword(),
        organizationId: aeon.id,
      },
    });
    await prisma.userRole.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, roleId: roles[roleCode] },
    });
    for (const nodeId of nodeIds) {
      await prisma.userHierarchyNode.upsert({
        where: { userId_nodeId: { userId: user.id, nodeId } },
        update: {},
        create: { userId: user.id, nodeId },
      });
    }
    for (const [resourceId, effect] of overrides) {
      await prisma.userOverride.upsert({
        where: {
          userId_resourceType_resourceId: { userId: user.id, resourceType: 'product', resourceId },
        },
        update: { effect },
        create: { userId: user.id, resourceType: 'product', resourceId, effect },
      });
    }
    const digest = createHash('sha256').update(`seed-api-key:${name}`).digest();
    const key = buildApiKey(digest.subarray(0, 6).toString('hex'), digest.toString('base64url'));
    await prisma.apiClient.upsert({
      where: { userId: user.id },
      update: { keyPrefix: key.prefix, keyHash: key.hash, status: 'active' },
      create: { name, userId: user.id, keyPrefix: key.prefix, keyHash: key.hash },
    });
    apiKeys[name] = key.key;
  };
  await client('Alan', 'CATALOG_ADMIN', []);
  await client('John', 'CATALOG_STAFF', [johnsTerritory.id], [[table.id, 'DENY']]);
  await client('Ben', 'CATALOG_STAFF', [bensTerritory.id], [[table.id, 'ALLOW']]);
  await client('Aisha', 'CATALOG_STAFF', [malaysia.id, singapore.id]);

  return {
    apiKeys,
    nodes: { furniture, malaysia, singapore, johnsTerritory, bensTerritory },
    organizations: { aeon },
  };
}

if (require.main === module) {
  config({ path: path.join(__dirname, '..', '.env'), quiet: true });
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  seed(prisma)
    .then(({ apiKeys }) => {
      console.log(`Seeded. Admin login: ${SEED_ADMIN.email} / ${SEED_ADMIN.password}`);
      console.log('API keys (send as the x-api-key header):');
      for (const [name, key] of Object.entries(apiKeys)) console.log(`  ${name.padEnd(6)} ${key}`);
    })
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
