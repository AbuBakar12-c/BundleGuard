import { execSync } from "node:child_process";

const url = process.env.DATABASE_URL ?? "";

execSync("npx prisma generate", { stdio: "inherit" });

if (url.startsWith("postgresql://") || url.startsWith("postgres://")) {
  console.log("[setup] Postgres detected — running prisma db push");
  execSync("npx prisma db push", { stdio: "inherit" });
} else {
  console.log("[setup] SQLite/dev — running prisma migrate deploy");
  execSync("npx prisma migrate deploy", { stdio: "inherit" });
}
