import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient;
}

/**
 * Cap the Postgres connection pool per process. Prisma's default pool size
 * (num CPUs * 2 + 1) is fine for one instance today, but leaves no headroom
 * once a second app instance, a migration job, or `prisma studio` connects
 * at the same time — small Postgres plans have a hard total-connection cap,
 * and exhausting it takes the app down for every shop at once. SQLite (dev)
 * is untouched since connection pooling doesn't apply to it.
 */
function resolveDatasourceUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url) return url;
  const isPostgres = url.startsWith("postgres://") || url.startsWith("postgresql://");
  if (!isPostgres || /[?&]connection_limit=/.test(url)) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}connection_limit=5`;
}

function createPrismaClient() {
  const url = resolveDatasourceUrl();
  return url ? new PrismaClient({ datasources: { db: { url } } }) : new PrismaClient();
}

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = createPrismaClient();
  }
}

const prisma = global.prismaGlobal ?? createPrismaClient();

export default prisma;
