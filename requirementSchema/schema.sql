-- =====================================================================
-- Access-control hierarchy: PostgreSQL schema
-- PART A mirrors schema.prisma (what `prisma migrate` would create).
-- PART B holds rules Prisma cannot express; add it to a custom migration:
--   npx prisma migrate dev --create-only --name access_extras
-- =====================================================================

-- ===================== PART A: tables (from schema.prisma) =====================

CREATE TYPE "OverrideEffect" AS ENUM ('ALLOW', 'DENY');

-- Organization, users, roles
CREATE TABLE "organization" (
    "id"   SERIAL NOT NULL,
    "name" TEXT   NOT NULL,
    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_user" (
    "id"              SERIAL  NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "name"            TEXT    NOT NULL,
    "email"           TEXT,
    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "role" (
    "id"             SERIAL  NOT NULL,
    "name"           TEXT    NOT NULL,
    "sees_all_rows"  BOOLEAN NOT NULL DEFAULT false,  -- true = Admin sees every row
    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_role" (
    "user_id" INTEGER NOT NULL,
    "role_id" INTEGER NOT NULL,
    CONSTRAINT "user_role_pkey" PRIMARY KEY ("user_id", "role_id")
);

-- User-defined hierarchy (levels and nodes are rows, so depth is data)
CREATE TABLE "hierarchy_level" (
    "id"              SERIAL  NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "level_no"        INTEGER NOT NULL,   -- 1 = top
    "name"            TEXT    NOT NULL,   -- Division, Country, Brand, ...
    CONSTRAINT "hierarchy_level_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "hierarchy_node" (
    "id"        SERIAL  NOT NULL,
    "level_id"  INTEGER NOT NULL,
    "parent_id" INTEGER,                  -- NULL = top node
    "name"      TEXT    NOT NULL,
    CONSTRAINT "hierarchy_node_pkey" PRIMARY KEY ("id")
);

-- A user can be assigned to many nodes
CREATE TABLE "user_hierarchy_node" (
    "user_id" INTEGER NOT NULL,
    "node_id" INTEGER NOT NULL,
    CONSTRAINT "user_hierarchy_node_pkey" PRIMARY KEY ("user_id", "node_id")
);

-- Example secured resource
CREATE TABLE "product" (
    "id"           SERIAL         NOT NULL,
    "sku"          TEXT           NOT NULL,
    "name"         TEXT           NOT NULL,
    "price"        DECIMAL(12,2)  NOT NULL,
    "availability" INTEGER        NOT NULL,
    "cost"         DECIMAL(12,2)  NOT NULL,
    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);

-- Generic tagging and parent control (resource_id is polymorphic: no FK)
CREATE TABLE "resource_node_tag" (
    "id"            SERIAL  NOT NULL,
    "resource_type" TEXT    NOT NULL,
    "resource_id"   INTEGER NOT NULL,
    "node_id"       INTEGER NOT NULL,
    CONSTRAINT "resource_node_tag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "node_block" (
    "id"            SERIAL  NOT NULL,
    "resource_type" TEXT    NOT NULL,
    "resource_id"   INTEGER NOT NULL,
    "node_id"       INTEGER NOT NULL,
    "reason"        TEXT,
    CONSTRAINT "node_block_pkey" PRIMARY KEY ("id")
);

-- Per-user overrides
CREATE TABLE "user_override" (
    "id"            SERIAL           NOT NULL,
    "user_id"       INTEGER          NOT NULL,
    "resource_type" TEXT             NOT NULL,
    "resource_id"   INTEGER          NOT NULL,
    "effect"        "OverrideEffect" NOT NULL,
    "reason"        TEXT,
    "created_at"    TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at"    TIMESTAMP(3),
    CONSTRAINT "user_override_pkey" PRIMARY KEY ("id")
);

-- Column-level access
CREATE TABLE "field_definition" (
    "id"              SERIAL  NOT NULL,
    "resource_type"   TEXT    NOT NULL,
    "field_name"      TEXT    NOT NULL,
    "default_visible" BOOLEAN NOT NULL DEFAULT false,   -- fail-closed
    CONSTRAINT "field_definition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "field_permission" (
    "id"       SERIAL  NOT NULL,
    "field_id" INTEGER NOT NULL,
    "role_id"  INTEGER,
    "level_id" INTEGER,
    "allowed"  BOOLEAN NOT NULL,                        -- false = DENY
    CONSTRAINT "field_permission_pkey" PRIMARY KEY ("id")
);

-- Unique indexes
CREATE UNIQUE INDEX "organization_name_key" ON "organization"("name");
CREATE UNIQUE INDEX "app_user_email_key" ON "app_user"("email");
CREATE UNIQUE INDEX "role_name_key" ON "role"("name");
CREATE UNIQUE INDEX "hierarchy_level_organization_id_level_no_key" ON "hierarchy_level"("organization_id", "level_no");
CREATE UNIQUE INDEX "hierarchy_level_organization_id_name_key" ON "hierarchy_level"("organization_id", "name");
CREATE UNIQUE INDEX "product_sku_key" ON "product"("sku");
CREATE UNIQUE INDEX "resource_node_tag_resource_type_resource_id_node_id_key" ON "resource_node_tag"("resource_type", "resource_id", "node_id");
CREATE UNIQUE INDEX "node_block_resource_type_resource_id_node_id_key" ON "node_block"("resource_type", "resource_id", "node_id");
CREATE UNIQUE INDEX "user_override_user_id_resource_type_resource_id_key" ON "user_override"("user_id", "resource_type", "resource_id");
CREATE UNIQUE INDEX "field_definition_resource_type_field_name_key" ON "field_definition"("resource_type", "field_name");

-- Lookup indexes
CREATE INDEX "app_user_organization_id_idx" ON "app_user"("organization_id");
CREATE INDEX "hierarchy_node_level_id_idx" ON "hierarchy_node"("level_id");
CREATE INDEX "hierarchy_node_parent_id_idx" ON "hierarchy_node"("parent_id");
CREATE INDEX "user_hierarchy_node_node_id_idx" ON "user_hierarchy_node"("node_id");
CREATE INDEX "resource_node_tag_node_id_idx" ON "resource_node_tag"("node_id");
CREATE INDEX "resource_node_tag_resource_type_resource_id_idx" ON "resource_node_tag"("resource_type", "resource_id");
CREATE INDEX "node_block_node_id_idx" ON "node_block"("node_id");
CREATE INDEX "field_permission_field_id_idx" ON "field_permission"("field_id");

-- Foreign keys
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hierarchy_level" ADD CONSTRAINT "hierarchy_level_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hierarchy_node" ADD CONSTRAINT "hierarchy_node_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "hierarchy_level"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "hierarchy_node" ADD CONSTRAINT "hierarchy_node_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "hierarchy_node"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_hierarchy_node" ADD CONSTRAINT "user_hierarchy_node_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_hierarchy_node" ADD CONSTRAINT "user_hierarchy_node_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "hierarchy_node"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resource_node_tag" ADD CONSTRAINT "resource_node_tag_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "hierarchy_node"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "node_block" ADD CONSTRAINT "node_block_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "hierarchy_node"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_override" ADD CONSTRAINT "user_override_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "field_permission" ADD CONSTRAINT "field_permission_field_id_fkey" FOREIGN KEY ("field_id") REFERENCES "field_definition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "field_permission" ADD CONSTRAINT "field_permission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "field_permission" ADD CONSTRAINT "field_permission_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "hierarchy_level"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ===================== PART B: extra rules (custom migration) =====================

-- Levels start at 1
ALTER TABLE "hierarchy_level" ADD CONSTRAINT "hierarchy_level_level_no_check" CHECK ("level_no" >= 1);

-- A field rule must target a role and/or a level
ALTER TABLE "field_permission" ADD CONSTRAINT "field_permission_subject_check"
    CHECK ("role_id" IS NOT NULL OR "level_id" IS NOT NULL);

-- No duplicate field rules (NULL-safe, which a plain UNIQUE is not)
CREATE UNIQUE INDEX "field_permission_unique_rule"
    ON "field_permission"("field_id", COALESCE("role_id", 0), COALESCE("level_id", 0));

-- A node's level must be exactly one below its parent's level
-- (and top nodes must be level 1), so the tree always matches the level definitions.
CREATE OR REPLACE FUNCTION check_node_level() RETURNS trigger AS $$
DECLARE
    child_no  INTEGER;
    child_org INTEGER;
    parent_no INTEGER;
    parent_org INTEGER;
BEGIN
    SELECT level_no, organization_id INTO child_no, child_org
      FROM hierarchy_level WHERE id = NEW.level_id;

    IF NEW.parent_id IS NULL THEN
        IF child_no <> 1 THEN
            RAISE EXCEPTION 'Top node must be at level 1 (got level %)', child_no;
        END IF;
    ELSE
        SELECT l.level_no, l.organization_id INTO parent_no, parent_org
          FROM hierarchy_node n JOIN hierarchy_level l ON l.id = n.level_id
         WHERE n.id = NEW.parent_id;
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

CREATE TRIGGER hierarchy_node_level_check
    BEFORE INSERT OR UPDATE OF level_id, parent_id ON "hierarchy_node"
    FOR EACH ROW EXECUTE FUNCTION check_node_level();
