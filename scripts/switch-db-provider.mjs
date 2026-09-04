#!/usr/bin/env node
/**
 * Toggle Prisma datasource provider between sqlite (local) and postgresql (prod).
 * Usage:
 *   node scripts/switch-db-provider.mjs postgres
 *   node scripts/switch-db-provider.mjs sqlite
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const target = (process.argv[2] || "").toLowerCase();
if (target !== "postgres" && target !== "postgresql" && target !== "sqlite") {
  console.error("Usage: node scripts/switch-db-provider.mjs <sqlite|postgres>");
  process.exit(1);
}

const provider = target.startsWith("postgres") ? "postgresql" : "sqlite";
const schemaPath = resolve("prisma/schema.prisma");
let schema = readFileSync(schemaPath, "utf8");

if (!/provider\s*=\s*"(sqlite|postgresql)"/.test(schema)) {
  console.error("Could not find datasource provider in prisma/schema.prisma");
  process.exit(1);
}

schema = schema.replace(
  /provider\s*=\s*"(sqlite|postgresql)"/,
  `provider = "${provider}"`,
);
writeFileSync(schemaPath, schema);

console.log(`✓ prisma/schema.prisma provider → ${provider}`);
if (provider === "postgresql") {
  console.log(`
Next:
  1. Set DATABASE_URL=postgresql://...
  2. For a fresh Postgres DB:
       npx prisma db push
     or regenerate migrations for Postgres (see docs/production-deploy.md)
  3. npx prisma generate
`);
} else {
  console.log(`
Next:
  1. Set DATABASE_URL=file:dev.sqlite
  2. npx prisma generate
  3. npx prisma migrate deploy
`);
}
