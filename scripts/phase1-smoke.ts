/**
 * Phase-1 smoke tests for GDPR / shop data lifecycle (no Shopify network).
 * Run: npx tsx scripts/phase1-smoke.ts
 */
import prisma from "../app/db.server";
import {
  exportCustomerData,
  purgeShopData,
  redactCustomerData,
} from "../app/services/shop-data.server";
import { captureShopperLead } from "../app/services/leads.server";

const SHOP = "phase1-smoke-test.myshopify.com";
const EMAIL = "qa.shopper@example.com";

async function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`  ✓ ${message}`);
}

async function main() {
  console.log("Phase 1 smoke tests\n");

  // Clean slate
  await purgeShopData(SHOP);

  console.log("1) Lead capture + unique email");
  const lead1 = await captureShopperLead({
    shop: SHOP,
    name: "QA Shopper",
    email: EMAIL,
  });
  const lead2 = await captureShopperLead({
    shop: SHOP,
    name: "QA Shopper Updated",
    email: EMAIL,
  });
  await assert(lead1.id === lead2.id, "same email upserts same lead");
  await assert(lead2.name === "QA Shopper Updated", "lead name updated");

  await prisma.buyerChatMessage.create({
    data: {
      shop: SHOP,
      role: "user",
      text: "Looking for a gift set",
      leadId: lead2.id,
    },
  });
  await prisma.bundle.create({
    data: {
      shop: SHOP,
      title: "Smoke Bundle",
      productId: "gid://shopify/Product/1",
      productVariantId: "gid://shopify/ProductVariant/1",
      price: "10.00",
    },
  });
  await prisma.chatMessage.create({
    data: { shop: SHOP, role: "user", text: "merchant chat" },
  });
  await prisma.shopAssistantSettings.upsert({
    where: { shop: SHOP },
    update: {},
    create: { shop: SHOP },
  });

  console.log("2) customers/data_request export");
  const exported = await exportCustomerData(SHOP, EMAIL);
  await assert(exported.leads.length === 1, "export returns lead");
  await assert(exported.messages.length >= 1, "export returns messages");

  console.log("3) customers/redact");
  const redacted = await redactCustomerData(SHOP, EMAIL);
  await assert(redacted.deletedLeads === 1, "redact deletes lead");
  const afterRedact = await exportCustomerData(SHOP, EMAIL);
  await assert(afterRedact.leads.length === 0, "lead gone after redact");

  console.log("4) shop/redact / uninstall purge");
  await captureShopperLead({
    shop: SHOP,
    name: "Temp",
    email: "temp@example.com",
  });
  await purgeShopData(SHOP);
  const bundles = await prisma.bundle.count({ where: { shop: SHOP } });
  const leads = await prisma.shopperLead.count({ where: { shop: SHOP } });
  const settings = await prisma.shopAssistantSettings.count({
    where: { shop: SHOP },
  });
  await assert(bundles === 0, "bundles purged");
  await assert(leads === 0, "leads purged");
  await assert(settings === 0, "settings purged");

  console.log("\nAll Phase 1 smoke tests passed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
