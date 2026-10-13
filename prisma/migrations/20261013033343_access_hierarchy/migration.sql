-- CreateEnum
CREATE TYPE "ApiClientStatus" AS ENUM ('active', 'suspended', 'revoked');

-- CreateEnum
CREATE TYPE "OverrideEffect" AS ENUM ('ALLOW', 'DENY');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "organizationId" INTEGER;

-- CreateTable
CREATE TABLE "apiClients" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "status" "ApiClientStatus" NOT NULL DEFAULT 'active',
    "allowedIps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expiresAt" TIMESTAMPTZ(3),
    "lastUsedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "apiClients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hierarchyLevels" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "levelNo" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "hierarchyLevels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hierarchyNodes" (
    "id" SERIAL NOT NULL,
    "levelId" INTEGER NOT NULL,
    "parentId" INTEGER,
    "name" TEXT NOT NULL,

    CONSTRAINT "hierarchyNodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "userHierarchyNodes" (
    "userId" INTEGER NOT NULL,
    "nodeId" INTEGER NOT NULL,

    CONSTRAINT "userHierarchyNodes_pkey" PRIMARY KEY ("userId","nodeId")
);

-- CreateTable
CREATE TABLE "products" (
    "id" SERIAL NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "availability" INTEGER NOT NULL,
    "cost" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resourceNodeTags" (
    "id" SERIAL NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" INTEGER NOT NULL,
    "nodeId" INTEGER NOT NULL,

    CONSTRAINT "resourceNodeTags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nodeBlocks" (
    "id" SERIAL NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" INTEGER NOT NULL,
    "nodeId" INTEGER NOT NULL,
    "reason" TEXT,

    CONSTRAINT "nodeBlocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "userOverrides" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" INTEGER NOT NULL,
    "effect" "OverrideEffect" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3),

    CONSTRAINT "userOverrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fieldDefinitions" (
    "id" SERIAL NOT NULL,
    "resourceType" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "defaultVisible" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "fieldDefinitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fieldPermissions" (
    "id" SERIAL NOT NULL,
    "fieldId" INTEGER NOT NULL,
    "roleId" BIGINT,
    "levelId" INTEGER,
    "allowed" BOOLEAN NOT NULL,

    CONSTRAINT "fieldPermissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "apiClients_userId_key" ON "apiClients"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "apiClients_keyPrefix_key" ON "apiClients"("keyPrefix");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_name_key" ON "organizations"("name");

-- CreateIndex
CREATE UNIQUE INDEX "hierarchyLevels_organizationId_levelNo_key" ON "hierarchyLevels"("organizationId", "levelNo");

-- CreateIndex
CREATE UNIQUE INDEX "hierarchyLevels_organizationId_name_key" ON "hierarchyLevels"("organizationId", "name");

-- CreateIndex
CREATE INDEX "hierarchyNodes_levelId_idx" ON "hierarchyNodes"("levelId");

-- CreateIndex
CREATE INDEX "hierarchyNodes_parentId_idx" ON "hierarchyNodes"("parentId");

-- CreateIndex
CREATE INDEX "userHierarchyNodes_nodeId_idx" ON "userHierarchyNodes"("nodeId");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE INDEX "resourceNodeTags_nodeId_idx" ON "resourceNodeTags"("nodeId");

-- CreateIndex
CREATE INDEX "resourceNodeTags_resourceType_resourceId_idx" ON "resourceNodeTags"("resourceType", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "resourceNodeTags_resourceType_resourceId_nodeId_key" ON "resourceNodeTags"("resourceType", "resourceId", "nodeId");

-- CreateIndex
CREATE INDEX "nodeBlocks_nodeId_idx" ON "nodeBlocks"("nodeId");

-- CreateIndex
CREATE UNIQUE INDEX "nodeBlocks_resourceType_resourceId_nodeId_key" ON "nodeBlocks"("resourceType", "resourceId", "nodeId");

-- CreateIndex
CREATE UNIQUE INDEX "userOverrides_userId_resourceType_resourceId_key" ON "userOverrides"("userId", "resourceType", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "fieldDefinitions_resourceType_fieldName_key" ON "fieldDefinitions"("resourceType", "fieldName");

-- CreateIndex
CREATE INDEX "fieldPermissions_fieldId_idx" ON "fieldPermissions"("fieldId");

-- CreateIndex
CREATE INDEX "users_organizationId_idx" ON "users"("organizationId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apiClients" ADD CONSTRAINT "apiClients_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hierarchyLevels" ADD CONSTRAINT "hierarchyLevels_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hierarchyNodes" ADD CONSTRAINT "hierarchyNodes_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "hierarchyLevels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hierarchyNodes" ADD CONSTRAINT "hierarchyNodes_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "hierarchyNodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "userHierarchyNodes" ADD CONSTRAINT "userHierarchyNodes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "userHierarchyNodes" ADD CONSTRAINT "userHierarchyNodes_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "hierarchyNodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resourceNodeTags" ADD CONSTRAINT "resourceNodeTags_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "hierarchyNodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nodeBlocks" ADD CONSTRAINT "nodeBlocks_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "hierarchyNodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "userOverrides" ADD CONSTRAINT "userOverrides_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fieldPermissions" ADD CONSTRAINT "fieldPermissions_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "fieldDefinitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fieldPermissions" ADD CONSTRAINT "fieldPermissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fieldPermissions" ADD CONSTRAINT "fieldPermissions_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "hierarchyLevels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===== Rules Prisma can't express (from requirementSchema/schema.sql PART B) =====

-- Levels start at 1
ALTER TABLE "hierarchyLevels" ADD CONSTRAINT "hierarchyLevels_levelNo_check" CHECK ("levelNo" >= 1);

-- A field rule must target a role and/or a level
ALTER TABLE "fieldPermissions" ADD CONSTRAINT "fieldPermissions_subject_check"
    CHECK ("roleId" IS NOT NULL OR "levelId" IS NOT NULL);

-- No duplicate field rules (NULL-safe, which a plain UNIQUE is not)
CREATE UNIQUE INDEX "fieldPermissions_unique_rule"
    ON "fieldPermissions"("fieldId", COALESCE("roleId", 0), COALESCE("levelId", 0));

-- A node's level must be exactly one below its parent's level (and top nodes must be level 1),
-- so the tree always matches the level definitions. This also rules out cycles.
CREATE OR REPLACE FUNCTION check_hierarchy_node_level() RETURNS trigger AS $$
DECLARE
    child_no   INTEGER;
    child_org  INTEGER;
    parent_no  INTEGER;
    parent_org INTEGER;
BEGIN
    SELECT "levelNo", "organizationId" INTO child_no, child_org
      FROM "hierarchyLevels" WHERE id = NEW."levelId";

    IF NEW."parentId" IS NULL THEN
        IF child_no <> 1 THEN
            RAISE EXCEPTION 'Top node must be at level 1 (got level %)', child_no;
        END IF;
    ELSE
        SELECT l."levelNo", l."organizationId" INTO parent_no, parent_org
          FROM "hierarchyNodes" n JOIN "hierarchyLevels" l ON l.id = n."levelId"
         WHERE n.id = NEW."parentId";
        IF parent_org <> child_org THEN
            RAISE EXCEPTION 'Parent and child must belong to the same organization';
        END IF;
        IF child_no <> parent_no + 1 THEN
            RAISE EXCEPTION 'Node level must be parent level + 1 (parent %, child %)', parent_no, child_no;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "hierarchyNodes_level_check"
    BEFORE INSERT OR UPDATE OF "levelId", "parentId" ON "hierarchyNodes"
    FOR EACH ROW EXECUTE FUNCTION check_hierarchy_node_level();
