/**
 * Phase 4 smoke: merchant webhook notifier (no Prisma / Shopify imports).
 * Run: npx tsx scripts/phase4-smoke.ts
 */
import { notifyBundleBlocked } from "../app/services/notifications.server";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`  ✓ ${message}`);
}

async function main() {
  console.log("Phase 4 smoke tests\n");

  console.log("1) Webhook notify no-ops without URL");
  delete process.env.MERCHANT_ALERT_WEBHOOK_URL;
  const skipped = await notifyBundleBlocked({
    type: "bundle_blocked",
    shop: "smoke.myshopify.com",
    bundleId: "b1",
    bundleTitle: "Smoke Kit",
    status: "blocked",
    blockReason: "test",
    availableQuantity: 0,
    gapCount: 1,
    at: new Date().toISOString(),
  });
  assert(skipped.sent === false, "skips when webhook not configured");
  assert(skipped.reason === "not_configured", "reason is not_configured");

  console.log("2) Webhook notify posts when URL set (mock)");
  const originalFetch = globalThis.fetch;
  let posted: unknown = null;
  globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    posted = JSON.parse(String(init?.body ?? "{}"));
    return new Response("ok", { status: 200 });
  }) as typeof fetch;

  process.env.MERCHANT_ALERT_WEBHOOK_URL = "https://example.com/hooks/test";
  const sent = await notifyBundleBlocked({
    type: "bundle_blocked",
    shop: "smoke.myshopify.com",
    bundleId: "b1",
    bundleTitle: "Smoke Kit",
    status: "blocked",
    blockReason: "component OOS",
    availableQuantity: 0,
    gapCount: 2,
    at: "2026-08-26T00:00:00.000Z",
  });
  globalThis.fetch = originalFetch;
  delete process.env.MERCHANT_ALERT_WEBHOOK_URL;

  assert(sent.sent === true, "sends when webhook configured");
  assert(
    (posted as { type?: string })?.type === "bundle_blocked",
    "payload type is bundle_blocked",
  );

  console.log("\nAll Phase 4 smoke tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
