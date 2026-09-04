/**
 * Phase 6 deploy readiness check (no network deploy).
 * Run: npx tsx scripts/phase6-smoke.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`  ✓ ${message}`);
}

function read(path: string) {
  return readFileSync(resolve(path), "utf8");
}

async function main() {
  console.log("Phase 6 deploy readiness\n");

  console.log("1) Host / Docker assets");
  assert(existsSync("Dockerfile"), "Dockerfile present");
  assert(existsSync("fly.toml"), "fly.toml present");
  assert(existsSync("docker-compose.yml"), "docker-compose (local Postgres) present");
  assert(existsSync(".env.production.example"), ".env.production.example present");
  assert(existsSync("docs/production-deploy.md"), "production deploy doc present");

  console.log("2) Docker ignores secrets");
  const dockerignore = read(".dockerignore");
  assert(dockerignore.includes(".env"), ".dockerignore excludes .env");

  console.log("3) Health + privacy routes");
  assert(existsSync("app/routes/healthz.tsx"), "/healthz route");
  assert(existsSync("app/routes/readyz.tsx"), "/readyz route");
  assert(existsSync("app/routes/privacy.tsx"), "/privacy route");
  assert(existsSync("app/routes/webhooks.compliance.tsx"), "GDPR webhooks route");
  assert(
    existsSync("app/services/entitlements.server.ts"),
    "centralized entitlements",
  );

  console.log("4) TOML production blockers to fix before go-live");
  const toml = read("shopify.app.toml");
  const stillPlaceholder =
    toml.includes("example.com") || toml.includes("REPLACE_WITH_PRODUCTION_HOST");
  if (stillPlaceholder) {
    console.log(
      "  ⚠ application_url still a placeholder — set Render HTTPS URL via scripts/set-production-url.ps1",
    );
  } else {
    assert(true, "application_url is a real host");
  }
  assert(toml.includes("compliance_topics"), "compliance webhooks configured");
  assert(toml.includes("write_app_proxy"), "app proxy scope present");

  console.log("5) Render assets");
  assert(existsSync("render.yaml"), "render.yaml present");
  assert(existsSync("docs/render-deploy.md"), "render-deploy.md present");
  const dockerfile = read("Dockerfile");
  assert(
    dockerfile.includes("switch-db-provider.mjs postgres"),
    "Dockerfile builds with Postgres Prisma provider",
  );
  const renderYaml = read("render.yaml");
  assert(renderYaml.includes("/readyz"), "Render healthCheckPath /readyz");

  console.log("6) Package scripts");
  const pkg = JSON.parse(read("package.json"));
  assert(Boolean(pkg.scripts["docker-start"]), "docker-start script");
  assert(Boolean(pkg.scripts.setup), "setup (migrate) script");
  assert(Boolean(pkg.scripts["deploy:check"]), "deploy:check script");

  assert(Boolean(pkg.scripts["deploy:render"]), "deploy:render script");
  assert(Boolean(pkg.scripts["smoke:prod"]), "smoke:prod script");

  console.log("\nPhase 6 readiness check passed.");
  console.log(`
Your manual go-live steps (Render):
  1. Push repo to GitHub; create Blueprint from render.yaml (docs/render-deploy.md)
  2. Set sync:false env vars on Render (Shopify + OpenAI + emails)
  3. powershell -ExecutionPolicy Bypass -File .\\scripts\\set-production-url.ps1 -Url https://….onrender.com
  4. npx shopify app deploy --config shopify.app.toml
  5. npm run smoke:prod -- https://….onrender.com
`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
