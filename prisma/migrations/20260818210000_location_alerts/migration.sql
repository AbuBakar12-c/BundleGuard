-- AlterTable
ALTER TABLE "BundleComponent" ADD COLUMN "sku" TEXT;

-- CreateTable
CREATE TABLE "InventoryAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "sku" TEXT,
    "locationName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" DATETIME
);

-- CreateIndex
CREATE INDEX "InventoryAlert_shop_readAt_idx" ON "InventoryAlert"("shop", "readAt");

-- CreateIndex
CREATE INDEX "InventoryAlert_bundleId_idx" ON "InventoryAlert"("bundleId");
