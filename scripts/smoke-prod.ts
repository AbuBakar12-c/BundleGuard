/**
 * Production smoke against a live HTTPS host.
 * Usage: npx tsx scripts/smoke-prod.ts https://your-app.up.railway.app
 *
 * Also prints the manual Shopify Admin checklist (OAuth, billing, Shopper Pro).
 */
const base = (process.argv[2] || process.env.SHOPIFY_APP_URL || "")
  .trim()
  .replace(/\/$/, "");

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

if (!base.startsWith("https://")) {
  fail("Pass a production HTTPS URL: npx tsx scripts/smoke-prod.ts https://….up.railway.app");
}
if (/example\.com|localhost|127\.0\.0\.1|trycloudflare|REPLACE_WITH/i.test(base)) {
  fail(`Refusing non-production URL: ${base}`);
}

async function get(path: string) {
  const res = await fetch(`${base}${path}`, {
    headers: { Accept: "application/json,text/html" },
  });
  const text = await res.text();
  return { res, text };
}

async function main() {
  console.log(`Production smoke → ${base}\n`);

  const health = await get("/healthz");
  if (!health.res.ok) fail(`/healthz HTTP ${health.res.status}`);
  const healthJson = JSON.parse(health.text) as { ok?: boolean };
  if (!healthJson.ok) fail("/healthz body.ok !== true");
  console.log("  ✓ /healthz");

  const ready = await get("/readyz");
  if (!ready.res.ok) fail(`/readyz HTTP ${ready.res.status} (is Postgres up?)`);
  const readyJson = JSON.parse(ready.text) as { ready?: boolean; db?: string };
  if (!readyJson.ready) fail("/readyz not ready");
  console.log(`  ✓ /readyz (db=${readyJson.db ?? "ok"})`);

  const privacy = await get("/privacy");
  if (!privacy.res.ok) fail(`/privacy HTTP ${privacy.res.status}`);
  if (!/Privacy Policy/i.test(privacy.text)) fail("/privacy missing expected content");
  console.log("  ✓ /privacy");

  // App proxy without HMAC should not succeed as Pro chat
  const proxy = await get("/apps/bundleguard/chat");
  console.log(
    `  · /apps/bundleguard/chat → HTTP ${proxy.res.status} (expect non-200 without Shopify HMAC)`,
  );

  console.log(`
Automated smoke passed for ${base}

Manual Shopify Admin checks (required for go-live):
  [ ] Install / open BundleGuard (OAuth completes)
  [ ] Dashboard loads (not Example Domain / REPLACE_WITH)
  [ ] Create a bundle; Audits page works
  [ ] Merchant AI per plan
  [ ] With SHOPIFY_BILLING_TEST=false: non-Pro storefront Shopper AI returns plan error
  [ ] Pro subscription unlocks Shopper AI
`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
