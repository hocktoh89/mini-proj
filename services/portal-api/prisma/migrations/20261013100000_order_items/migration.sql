-- Orders can now hold several items, one row per SKU in order_items.

-- CreateTable
CREATE TABLE "order_items" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "productSku" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_items_orderId_idx" ON "order_items"("orderId");

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Move existing single-item orders into order_items
INSERT INTO "order_items" ("orderId", "productSku", "quantity")
SELECT "id", "sku", "quantity" FROM "orders";

-- AlterTable
ALTER TABLE "orders" DROP COLUMN "sku",
DROP COLUMN "quantity";
