import prisma from "../db.server";
import type { LocationGap } from "./location-audit.server";

export async function replaceBundleAlerts(
  shop: string,
  bundleId: string,
  gaps: LocationGap[],
) {
  const blockedOrPriority = gaps.filter(
    (gap) =>
      gap.severity === "blocked" ||
      gap.kind === "fulfillment_priority_gap" ||
      gap.kind === "location_incomplete_kit",
  );

  await prisma.$transaction([
    prisma.inventoryAlert.deleteMany({ where: { shop, bundleId } }),
    ...blockedOrPriority.map((gap) =>
      prisma.inventoryAlert.create({
        data: {
          shop,
          bundleId,
          severity: gap.severity,
          kind: gap.kind,
          message: gap.message,
          sku: gap.sku,
          locationName: gap.locationName,
        },
      }),
    ),
  ]);
}

export async function getUnreadAlerts(shop: string) {
  return prisma.inventoryAlert.findMany({
    where: { shop, readAt: null },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}

export async function markAlertsRead(shop: string) {
  await prisma.inventoryAlert.updateMany({
    where: { shop, readAt: null },
    data: { readAt: new Date() },
  });
}
