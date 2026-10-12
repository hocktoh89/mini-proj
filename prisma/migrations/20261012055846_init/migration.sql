-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'inactive', 'locked');

-- CreateEnum
CREATE TYPE "RoleStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "PermissionStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "PermissionType" AS ENUM ('menu', 'action', 'api', 'report', 'setting');

-- CreateEnum
CREATE TYPE "PermissionRiskLevel" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "username" TEXT,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "lastLoginAt" TIMESTAMPTZ,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" BIGSERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "level" INTEGER NOT NULL,
    "isSystemRole" BOOLEAN NOT NULL DEFAULT true,
    "status" "RoleStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" BIGSERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "type" "PermissionType" NOT NULL,
    "riskLevel" "PermissionRiskLevel" NOT NULL,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "status" "PermissionStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "userRoles" (
    "id" BIGSERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "roleId" BIGINT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "userRoles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rolePermissions" (
    "id" BIGSERIAL NOT NULL,
    "roleId" BIGINT NOT NULL,
    "permissionId" BIGINT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rolePermissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refreshTokens" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(3),
    "replacedByTokenId" TEXT,

    CONSTRAINT "refreshTokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "userRoles_userId_key" ON "userRoles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "rolePermissions_roleId_permissionId_key" ON "rolePermissions"("roleId", "permissionId");

-- CreateIndex
CREATE INDEX "refreshTokens_userId_idx" ON "refreshTokens"("userId");

-- AddForeignKey
ALTER TABLE "userRoles" ADD CONSTRAINT "userRoles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "userRoles" ADD CONSTRAINT "userRoles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rolePermissions" ADD CONSTRAINT "rolePermissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rolePermissions" ADD CONSTRAINT "rolePermissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refreshTokens" ADD CONSTRAINT "refreshTokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
