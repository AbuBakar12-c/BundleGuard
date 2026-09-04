-- CreateTable
CREATE TABLE "Bundle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productVariantId" TEXT NOT NULL,
    "price" TEXT NOT NULL DEFAULT '0.00',
    "oosRule" TEXT NOT NULL DEFAULT 'block_when_any_component_oos',
    "status" TEXT NOT NULL DEFAULT 'healthy',
    "availableQuantity" INTEGER NOT NULL DEFAULT 0,
    "blockReason" TEXT,
    "lastSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BundleComponent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bundleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productVariantId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "variantTitle" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "inventoryPolicy" TEXT NOT NULL DEFAULT 'DENY',
    "availableQty" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "BundleComponent_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "Bundle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Bundle_shop_idx" ON "Bundle"("shop");

-- CreateIndex
CREATE INDEX "Bundle_productVariantId_idx" ON "Bundle"("productVariantId");

-- CreateIndex
CREATE INDEX "BundleComponent_bundleId_idx" ON "BundleComponent"("bundleId");

-- CreateIndex
CREATE INDEX "BundleComponent_productVariantId_idx" ON "BundleComponent"("productVariantId");
