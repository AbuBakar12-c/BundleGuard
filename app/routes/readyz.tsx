import prisma from "../db.server";

/**
 * Readiness probe — verifies the process can reach the database.
 * Keep this cheap (SELECT 1). Used by orchestrators after deploy.
 */
export async function loader() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({
      ok: true,
      ready: true,
      service: "bundleguard",
      db: "up",
      ts: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[readyz] database check failed", error);
    return Response.json(
      {
        ok: false,
        ready: false,
        service: "bundleguard",
        db: "down",
        ts: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
