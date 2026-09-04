-- CreateTable
CREATE TABLE "ShopAssistantSettings" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "buyerEnabled" BOOLEAN NOT NULL DEFAULT true,
    "welcomeMessage" TEXT NOT NULL DEFAULT 'Hi! I can help you find products and check what''s in stock.',
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BuyerChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "BuyerChatMessage_shop_createdAt_idx" ON "BuyerChatMessage"("shop", "createdAt");
