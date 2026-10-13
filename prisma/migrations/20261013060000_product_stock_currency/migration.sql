-- availability used to hold the stock quantity. Move it to stockQty and turn availability into the
-- ERP's in-stock flag, keeping every product's current stock.
ALTER TABLE "products" ADD COLUMN "currency" CHAR(3) NOT NULL DEFAULT 'USD';
ALTER TABLE "products" ADD COLUMN "stockQty" INTEGER NOT NULL DEFAULT 0;
UPDATE "products" SET "stockQty" = "availability";
ALTER TABLE "products"
    ALTER COLUMN "availability" TYPE BOOLEAN USING "availability" > 0,
    ALTER COLUMN "availability" SET DEFAULT false;

-- Field rules key on column names: give the new stock column the visibility the old one had.
INSERT INTO "fieldDefinitions" ("resourceType", "fieldName", "defaultVisible")
SELECT 'product', 'stockQty', "defaultVisible" FROM "fieldDefinitions"
 WHERE "resourceType" = 'product' AND "fieldName" = 'availability'
ON CONFLICT DO NOTHING;
INSERT INTO "fieldPermissions" ("fieldId", "roleId", "levelId", "allowed")
SELECT n.id, p."roleId", p."levelId", p."allowed"
  FROM "fieldPermissions" p
  JOIN "fieldDefinitions" o ON o.id = p."fieldId" AND o."resourceType" = 'product' AND o."fieldName" = 'availability'
  JOIN "fieldDefinitions" n ON n."resourceType" = 'product' AND n."fieldName" = 'stockQty'
ON CONFLICT DO NOTHING;
INSERT INTO "fieldDefinitions" ("resourceType", "fieldName", "defaultVisible")
SELECT 'product', 'currency', true WHERE EXISTS (SELECT 1 FROM "fieldDefinitions" WHERE "resourceType" = 'product')
ON CONFLICT DO NOTHING;
