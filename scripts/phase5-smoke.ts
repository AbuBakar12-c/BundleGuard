/**
 * Phase 5 smoke: lead trend helper (uses Prisma).
 * Run: npx tsx scripts/phase5-smoke.ts
 */
import prisma from "../app/db.server";
import {
  captureShopperLead,
  getLeadDailyTrend,
  getLeadStats,
} from "../app/services/leads.server";
import { purgeShopData } from "../app/services/shop-data.server";

const SHOP = "phase5-smoke.myshopify.com";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`  ✓ ${message}`);
}

async function main() {
  console.log("Phase 5 smoke tests\n");
  await purgeShopData(SHOP);

  console.log("1) Lead trend buckets");
  await captureShopperLead({
    shop: SHOP,
    name: "Chart User",
    email: "chart@example.com",
  });
  const trend = await getLeadDailyTrend(SHOP, 7);
  assert(trend.length === 7, "trend has 7 days");
  assert(
    trend.reduce((sum, d) => sum + d.count, 0) >= 1,
    "today/recent day has at least one lead",
  );

  const stats = await getLeadStats(SHOP);
  assert(stats.total >= 1, "stats total >= 1");
  assert(stats.captured >= 1, "stats captured >= 1");

  await purgeShopData(SHOP);
  console.log("\nAll Phase 5 smoke tests passed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
