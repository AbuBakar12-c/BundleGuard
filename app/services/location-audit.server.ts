export type InventoryStateName =
  | "available"
  | "on_hand"
  | "committed"
  | "reserved";

export interface LocationInventoryRow {
  locationId: string;
  locationName: string;
  isActive: boolean;
  fulfillsOnlineOrders: boolean;
  available: number;
  onHand: number;
  committed: number;
  reserved: number;
}

export interface VariantLocationSnapshot {
  productVariantId: string;
  productTitle: string;
  variantTitle: string;
  sku: string | null;
  tracked: boolean;
  mapped: boolean;
  inventoryPolicy: string;
  requiredQty: number;
  locations: LocationInventoryRow[];
}

export type LocationGapKind =
  | "sku_unmapped"
  | "missing_sku"
  | "on_hand_mismatch"
  | "location_incomplete_kit"
  | "fulfillment_priority_gap";

export interface LocationGap {
  kind: LocationGapKind;
  severity: "blocked" | "warning";
  message: string;
  sku: string | null;
  productVariantId: string;
  productTitle: string;
  locationName: string | null;
}

export interface LocationKitCount {
  locationId: string;
  locationName: string;
  fulfillsOnlineOrders: boolean;
  kits: number;
}

function qtyNamed(
  quantities: Array<{ name: string; quantity: number }> | undefined,
  name: InventoryStateName,
) {
  return quantities?.find((quantity) => quantity.name === name)?.quantity ?? 0;
}

export function toLocationRows(
  levels: Array<{
    quantities?: Array<{ name: string; quantity: number }>;
    location?: {
      id: string;
      name: string;
      isActive: boolean;
      fulfillsOnlineOrders: boolean;
    } | null;
  }>,
): LocationInventoryRow[] {
  return levels
    .filter((level) => level.location?.id)
    .map((level) => ({
      locationId: level.location!.id,
      locationName: level.location!.name,
      isActive: level.location!.isActive,
      fulfillsOnlineOrders: level.location!.fulfillsOnlineOrders,
      available: qtyNamed(level.quantities, "available"),
      onHand: qtyNamed(level.quantities, "on_hand"),
      committed: qtyNamed(level.quantities, "committed"),
      reserved: qtyNamed(level.quantities, "reserved"),
    }));
}

export function kitsAtLocation(
  snapshots: VariantLocationSnapshot[],
  locationId: string,
) {
  let kits = Number.POSITIVE_INFINITY;

  for (const snapshot of snapshots) {
    if (!snapshot.tracked || snapshot.inventoryPolicy === "CONTINUE") {
      continue;
    }

    const row = snapshot.locations.find(
      (location) => location.locationId === locationId,
    );
    const available = row?.available ?? 0;
    kits = Math.min(kits, Math.floor(available / snapshot.requiredQty));
  }

  return Number.isFinite(kits) ? Math.max(0, kits) : 0;
}

export function sellableKitsByLocation(
  snapshots: VariantLocationSnapshot[],
): LocationKitCount[] {
  const locations = new Map<string, LocationKitCount>();

  for (const snapshot of snapshots) {
    for (const row of snapshot.locations) {
      if (!locations.has(row.locationId)) {
        locations.set(row.locationId, {
          locationId: row.locationId,
          locationName: row.locationName,
          fulfillsOnlineOrders: row.fulfillsOnlineOrders,
          kits: 0,
        });
      }
    }
  }

  for (const location of locations.values()) {
    location.kits = kitsAtLocation(snapshots, location.locationId);
  }

  return [...locations.values()];
}

export function locationAwareAvailableQuantity(
  snapshots: VariantLocationSnapshot[],
) {
  return sellableKitsByLocation(snapshots).reduce(
    (sum, location) => sum + location.kits,
    0,
  );
}

export function runLocationAudit(
  bundleTitle: string,
  snapshots: VariantLocationSnapshot[],
): LocationGap[] {
  const gaps: LocationGap[] = [];

  for (const snapshot of snapshots) {
    if (!snapshot.mapped) {
      gaps.push({
        kind: "sku_unmapped",
        severity: "blocked",
        message: `${bundleTitle}: ${snapshot.productTitle} variant is not mapped in Shopify (SKU/variant missing)`,
        sku: snapshot.sku,
        productVariantId: snapshot.productVariantId,
        productTitle: snapshot.productTitle,
        locationName: null,
      });
      continue;
    }

    if (!snapshot.sku) {
      gaps.push({
        kind: "missing_sku",
        severity: "warning",
        message: `${snapshot.productTitle} — ${snapshot.variantTitle} has no SKU. Variant-level sync cannot be verified.`,
        sku: null,
        productVariantId: snapshot.productVariantId,
        productTitle: snapshot.productTitle,
        locationName: null,
      });
    }

    for (const row of snapshot.locations) {
      if (row.onHand !== row.available) {
        gaps.push({
          kind: "on_hand_mismatch",
          severity: "warning",
          message: `SKU ${snapshot.sku ?? "unset"} at ${row.locationName}: Shopify on-hand ${row.onHand} vs available ${row.available} (committed ${row.committed}, reserved ${row.reserved})`,
          sku: snapshot.sku,
          productVariantId: snapshot.productVariantId,
          productTitle: snapshot.productTitle,
          locationName: row.locationName,
        });
      }
    }
  }

  const kitCounts = sellableKitsByLocation(snapshots);
  const fulfillmentLocations = kitCounts.filter(
    (location) => location.fulfillsOnlineOrders,
  );
  const locationsToCheck =
    fulfillmentLocations.length > 0 ? fulfillmentLocations : kitCounts;

  for (const location of locationsToCheck) {
    if (location.kits <= 0) {
      const missing = snapshots
        .filter((snapshot) => snapshot.tracked)
        .filter((snapshot) => {
          const row = snapshot.locations.find(
            (item) => item.locationId === location.locationId,
          );
          return (row?.available ?? 0) < snapshot.requiredQty;
        })
        .map((snapshot) => snapshot.sku ?? snapshot.productTitle);

      gaps.push({
        kind: "location_incomplete_kit",
        severity: locationsToCheck.every((item) => item.kits <= 0)
          ? "blocked"
          : "warning",
        message: `${bundleTitle} cannot be assembled at ${location.locationName}. Short: ${missing.join(", ") || "component stock"}`,
        sku: null,
        productVariantId: snapshots[0]?.productVariantId ?? "",
        productTitle: bundleTitle,
        locationName: location.locationName,
      });
    }
  }

  const totalKits = kitCounts.reduce((sum, location) => sum + location.kits, 0);
  const fulfillmentKits = fulfillmentLocations.reduce(
    (sum, location) => sum + location.kits,
    0,
  );

  if (
    fulfillmentLocations.length > 0 &&
    fulfillmentKits <= 0 &&
    totalKits > 0
  ) {
    gaps.push({
      kind: "fulfillment_priority_gap",
      severity: "blocked",
      message: `${bundleTitle} has complete kits at non-fulfillment locations, but 0 kits at locations that fulfill online orders`,
      sku: null,
      productVariantId: snapshots[0]?.productVariantId ?? "",
      productTitle: bundleTitle,
      locationName: null,
    });
  }

  return gaps;
}
