-- CreateTable
CREATE TABLE "ShopperLead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'captured',
    "source" TEXT NOT NULL DEFAULT 'shopper_chat',
    "sessionKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BuyerChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "leadId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BuyerChatMessage_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "ShopperLead" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_BuyerChatMessage" ("createdAt", "id", "role", "shop", "text") SELECT "createdAt", "id", "role", "shop", "text" FROM "BuyerChatMessage";
DROP TABLE "BuyerChatMessage";
ALTER TABLE "new_BuyerChatMessage" RENAME TO "BuyerChatMessage";
CREATE INDEX "BuyerChatMessage_shop_createdAt_idx" ON "BuyerChatMessage"("shop", "createdAt");
CREATE INDEX "BuyerChatMessage_leadId_idx" ON "BuyerChatMessage"("leadId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ShopperLead_shop_createdAt_idx" ON "ShopperLead"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "ShopperLead_shop_status_idx" ON "ShopperLead"("shop", "status");

-- CreateIndex
CREATE INDEX "ShopperLead_shop_email_idx" ON "ShopperLead"("shop", "email");
