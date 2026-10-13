-- API-key access is removed: every caller now authenticates with a login session (Bearer token or
-- the httpOnly cookie).

-- DropTable
DROP TABLE "apiClients";

-- DropEnum
DROP TYPE "ApiClientStatus";

-- Remove the permission that managed API clients (its rolePermissions rows cascade).
DELETE FROM "permissions" WHERE "code" = 'apiClients.manage';
