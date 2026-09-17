import prisma from "../db.server";
import { UserFacingError } from "./http.server";
import type {
  AuditIssue,
  BundleHealthResult,
  BundleStatus,
  ComponentInput,
  OosRule,
} from "../models/bundles.types";
import { replaceBundleAlerts } from "./alerts.server";
import {
  locationAwareAvailableQuantity,
  runLocationAudit,
  toLocationRows,
  type VariantLocationSnapshot,
} from "./location-audit.server";

type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

interface VariantInventoryNode {
  id: string;
  title: string;
  sku: string | null;
  inventoryPolicy: string;
  inventoryQuantity: number | null;
  product: { id: string; title: string };
  inventoryItem: {
    id: string;
    tracked: boolean;
    sku: string | null;
    inventoryLevels: {
      nodes: Array<{
        quantities: Array<{ name: string; quantity: number }>;
        location: {
          id: string;
          name: string;
          isActive: boolean;
          fulfillsOnlineOrders: boolean;
        };
      }>;
    };
  };
}

export async function getBundlesForShop(shop: string) {
  return prisma.bundle.findMany({
    where: { shop },
    include: { components: true },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getBundleById(shop: string, id: string) {
  return prisma.bundle.findFirst({
    where: { shop, id },
    include: { components: true },
  });
}

async function fetchVariantInventory(
  admin: AdminGraphql,
  variantIds: string[],
): Promise<Map<string, VariantInventoryNode>> {
  if (variantIds.length === 0) {
    return new Map();
  }

  const response = await admin.graphql(
    `#graphql
      query BundleGuardVariantInventory($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on ProductVariant {
            id
            title
            sku
            inventoryPolicy
            inventoryQuantity
            product { id title }
            inventoryItem {
              id
              tracked
              sku
              inventoryLevels(first: 50) {
                nodes {
                  quantities(names: ["available", "on_hand", "committed", "reserved"]) {
                    name
                    quantity
                  }
                  location {
                    id
                    name
                    isActive
                    fulfillsOnlineOrders
                  }
                }
              }
            }
          }
        }
      }`,
    { variables: { ids: variantIds } },
  );

  if (!response.ok) {
    throw new UserFacingError(
      `Inventory lookup failed (HTTP ${response.status}). Try again shortly.`,
    );
  }

  const json = (await response.json()) as {
    data?: { nodes?: Array<VariantInventoryNode | null> };
    errors?: Array<{ message: string }>;
  };

  if (json.errors?.length) {
    throw new UserFacingError(
      `Inventory GraphQL error: ${json.errors.map((e) => e.message).join("; ")}`,
    );
  }

  const map = new Map<string, VariantInventoryNode>();
  for (const node of json.data?.nodes ?? []) {
    if (node?.id) {
      map.set(node.id, node);
    }
  }

  const missing = variantIds.filter((id) => !map.has(id));
  if (missing.length === variantIds.length) {
    throw new UserFacingError(
      "Could not load any component variants from Shopify. Check product access and try resync.",
    );
  }

  return map;
}

export function calculateBundleHealth(
  oosRule: OosRule,
  components: Array<{
    productVariantId: string;
    productTitle: string;
    variantTitle: string;
    quantity: number;
    inventoryPolicy: string;
    availableQty: number;
  }>,
): BundleHealthResult {
  const warnings: string[] = [];
  const componentIssues: BundleHealthResult["componentIssues"] = [];

  let minBundles = Number.POSITIVE_INFINITY;

  for (const component of components) {
    const bundlesFromComponent = Math.floor(
      component.availableQty / component.quantity,
    );

    if (component.inventoryPolicy === "NOT_TRACKED") {
      warnings.push(
        `${component.productTitle} does not track inventory — excluded from availability math`,
      );
      continue;
    }

    if (component.inventoryPolicy === "CONTINUE") {
      warnings.push(
        `${component.productTitle} allows continue selling when OOS — excluded from availability math`,
      );

      if (oosRule === "block_when_any_component_oos") {
        componentIssues.push({
          productVariantId: component.productVariantId,
          productTitle: component.productTitle,
          variantTitle: component.variantTitle,
          issue: "Continue selling when out of stock is enabled",
          inventoryPolicy: component.inventoryPolicy,
          availableQty: component.availableQty,
          requiredQty: component.quantity,
        });
      }

      if (oosRule !== "ignore_continue_selling_components") {
        continue;
      }
    }

    if (component.availableQty < component.quantity) {
      componentIssues.push({
        productVariantId: component.productVariantId,
        productTitle: component.productTitle,
        variantTitle: component.variantTitle,
        issue: `Only ${component.availableQty} available, need ${component.quantity} per bundle`,
        inventoryPolicy: component.inventoryPolicy,
        availableQty: component.availableQty,
        requiredQty: component.quantity,
      });
    }

    minBundles = Math.min(minBundles, bundlesFromComponent);
  }

  if (!Number.isFinite(minBundles)) {
    minBundles = 0;
  }

  let status: BundleStatus = "healthy";
  let blockReason: string | null = null;

  if (componentIssues.some((i) => i.issue.includes("Only"))) {
    status = "blocked";
    const bottleneck = componentIssues.find((i) => i.issue.includes("Only"));
    blockReason = bottleneck
      ? `${bottleneck.productTitle} — ${bottleneck.variantTitle}: ${bottleneck.issue}`
      : "Component inventory too low";
  } else if (componentIssues.length > 0 || warnings.length > 0) {
    status = oosRule === "allow_partial_with_warning" ? "warning" : "blocked";
    blockReason =
      componentIssues[0]?.issue ?? warnings[0] ?? "Policy configuration issue";
  }

  if (minBundles <= 0 && status === "healthy") {
    status = "blocked";
    blockReason = "No sellable bundle quantity from component inventory";
  }

  return {
    status,
    availableQuantity: Math.max(0, minBundles),
    blockReason,
    warnings,
    componentIssues,
  };
}

export async function syncBundleHealth(
  admin: AdminGraphql,
  bundleId: string,
  shop: string,
) {
  const bundle = await getBundleById(shop, bundleId);
  if (!bundle) {
    throw new UserFacingError("Bundle not found");
  }

  const variantIds = bundle.components.map((c) => c.productVariantId);
  const inventoryMap = await fetchVariantInventory(admin, variantIds);

  const snapshots: VariantLocationSnapshot[] = bundle.components.map(
    (component) => {
      const variant = inventoryMap.get(component.productVariantId);
      const tracked = variant?.inventoryItem?.tracked !== false;
      return {
        productVariantId: component.productVariantId,
        productTitle: variant?.product.title ?? component.productTitle,
        variantTitle: variant?.title ?? component.variantTitle,
        sku: variant?.sku ?? variant?.inventoryItem?.sku ?? null,
        tracked,
        mapped: Boolean(variant),
        inventoryPolicy: !tracked
          ? "NOT_TRACKED"
          : (variant?.inventoryPolicy ?? component.inventoryPolicy),
        requiredQty: component.quantity,
        locations: variant
          ? toLocationRows(variant.inventoryItem?.inventoryLevels?.nodes ?? [])
          : [],
      };
    },
  );

  const enriched = snapshots.map((snapshot) => ({
    productVariantId: snapshot.productVariantId,
    productTitle: snapshot.productTitle,
    variantTitle: snapshot.variantTitle,
    quantity: snapshot.requiredQty,
    inventoryPolicy: snapshot.inventoryPolicy,
    availableQty: snapshot.locations.reduce(
      (sum, location) => sum + location.available,
      0,
    ),
  }));

  const health = calculateBundleHealth(
    bundle.oosRule as OosRule,
    enriched,
  );
  const locationQuantity = locationAwareAvailableQuantity(snapshots);
  health.availableQuantity = locationQuantity;

  const locationGaps = runLocationAudit(bundle.title, snapshots);
  if (
    locationGaps.some((gap) => gap.severity === "blocked") &&
    health.status === "healthy"
  ) {
    health.status = "blocked";
    health.blockReason =
      locationGaps.find((gap) => gap.severity === "blocked")?.message ??
      "Location fulfillment gap";
  }

  const previousStatus = bundle.status;

  await prisma.$transaction([
    ...bundle.components.map((component, index) =>
      prisma.bundleComponent.update({
        where: { id: component.id },
        data: {
          availableQty: enriched[index]?.availableQty ?? 0,
          inventoryPolicy: enriched[index]?.inventoryPolicy ?? "DENY",
          sku: snapshots[index]?.sku,
        },
      }),
    ),
    prisma.bundle.update({
      where: { id: bundle.id },
      data: {
        status: health.status,
        availableQuantity: health.availableQuantity,
        blockReason: health.blockReason,
        lastSyncedAt: new Date(),
      },
    }),
  ]);

  await replaceBundleAlerts(shop, bundle.id, locationGaps);

  if (health.status === "blocked" && previousStatus !== "blocked") {
    try {
      const { resolveEntitlementsFromAdmin } = await import(
        "./entitlements.server"
      );
      const entitlements = await resolveEntitlementsFromAdmin(shop, admin);
      if (entitlements.features.blockedAlerts) {
        const { notifyBundleBlocked } = await import("./notifications.server");
        await notifyBundleBlocked({
          type: "bundle_blocked",
          shop,
          bundleId: bundle.id,
          bundleTitle: bundle.title,
          status: health.status,
          blockReason: health.blockReason,
          availableQuantity: health.availableQuantity,
          gapCount: locationGaps.filter((g) => g.severity === "blocked")
            .length,
          at: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error("[bundles] blocked alert notify failed", error);
    }
  }

  return {
    bundle: await getBundleById(shop, bundleId),
    health,
    locationGaps,
    snapshots,
  };
}

// Bounded concurrency: fast enough that a webhook burst (orders/create,
// inventory_levels/update) doesn't serialize one Shopify GraphQL round trip
// per bundle, but low enough to stay well under a shop's API rate-limit
// bucket. Each bundle's read/write is independent (keyed by its own
// bundleId, no shared mutable state), so running them concurrently cannot
// mix data between bundles or shops.
const SYNC_CONCURRENCY = 3;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker() {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

export async function syncAllBundles(admin: AdminGraphql, shop: string) {
  const bundles = await getBundlesForShop(shop);

  return mapWithConcurrency(bundles, SYNC_CONCURRENCY, async (bundle) => {
    try {
      return await syncBundleHealth(admin, bundle.id, shop);
    } catch (error) {
      console.error(
        `[BundleGuard] sync failed for bundle ${bundle.id} (${shop})`,
        error,
      );
      return {
        bundle,
        health: {
          status: bundle.status as BundleStatus,
          availableQuantity: bundle.availableQuantity,
          blockReason:
            error instanceof Error
              ? `Sync error: ${error.message}`
              : "Sync error",
          warnings: [],
          componentIssues: [],
        },
        locationGaps: [],
        snapshots: [] as VariantLocationSnapshot[],
      };
    }
  });
}

export async function createBundle(
  admin: AdminGraphql,
  shop: string,
  input: {
    title: string;
    price: string;
    oosRule: OosRule;
    components: ComponentInput[];
  },
) {
  if (input.components.length < 2) {
    throw new Error("A bundle needs at least 2 component products");
  }

  const productResponse = await admin.graphql(
    `#graphql
      mutation BundleGuardCreateProduct($product: ProductCreateInput!) {
        productCreate(product: $product) {
          product {
            id
            title
            variants(first: 1) {
              nodes { id }
            }
          }
          userErrors { field message }
        }
      }`,
    {
      variables: {
        product: {
          title: input.title,
          status: "ACTIVE",
        },
      },
    },
  );

  const productJson = await productResponse.json();
  const product = productJson.data?.productCreate?.product;
  const productErrors = productJson.data?.productCreate?.userErrors ?? [];

  if (productErrors.length > 0 || !product) {
    throw new UserFacingError(
      productErrors.map((e: { message: string }) => e.message).join(", ") ||
        "Failed to create bundle product",
    );
  }

  const variantId = product.variants.nodes[0]?.id as string;

  // `reason` must always be curated/safe text — this is the message shown
  // to the merchant verbatim after the rollback.
  const rollbackProduct = async (reason: string) => {
    try {
      await admin.graphql(
        `#graphql
          mutation BundleGuardDeleteOrphanProduct($input: ProductDeleteInput!) {
            productDelete(input: $input) {
              deletedProductId
              userErrors { field message }
            }
          }`,
        { variables: { input: { id: product.id } } },
      );
    } catch (error) {
      console.error(
        "[BundleGuard] Failed to rollback orphan product",
        product.id,
        error,
      );
    }
    throw new UserFacingError(reason);
  };

  const priceResponse = await admin.graphql(
    `#graphql
      mutation BundleGuardUpdateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          userErrors { field message }
        }
      }`,
    {
      variables: {
        productId: product.id,
        variants: [{ id: variantId, price: input.price }],
      },
    },
  );

  const priceJson = await priceResponse.json();
  const priceErrors =
    priceJson.data?.productVariantsBulkUpdate?.userErrors ?? [];
  if (priceErrors.length > 0) {
    await rollbackProduct(
      priceErrors.map((e: { message: string }) => e.message).join(", ") ||
        "Failed to set bundle price",
    );
  }

  const relationshipResponse = await admin.graphql(
    `#graphql
      mutation BundleGuardCreateComponents($input: [ProductVariantRelationshipUpdateInput!]!) {
        productVariantRelationshipBulkUpdate(input: $input) {
          userErrors { field message }
        }
      }`,
    {
      variables: {
        input: [
          {
            parentProductVariantId: variantId,
            productVariantRelationshipsToCreate: input.components.map(
              (component) => ({
                id: component.productVariantId,
                quantity: component.quantity,
              }),
            ),
          },
        ],
      },
    },
  );

  const relationshipJson = await relationshipResponse.json();
  const relationshipErrors =
    relationshipJson.data?.productVariantRelationshipBulkUpdate?.userErrors ??
    [];

  if (relationshipErrors.length > 0) {
    await rollbackProduct(
      relationshipErrors
        .map((e: { message: string }) => e.message)
        .join(", ") || "Failed to attach bundle components",
    );
  }

  try {
    const bundle = await prisma.bundle.create({
      data: {
        shop,
        title: input.title,
        productId: product.id,
        productVariantId: variantId,
        price: input.price,
        oosRule: input.oosRule,
        components: {
          create: input.components.map((component) => ({
            productId: component.productId,
            productVariantId: component.productVariantId,
            productTitle: component.productTitle,
            variantTitle: component.variantTitle,
            quantity: component.quantity,
          })),
        },
      },
      include: { components: true },
    });

    return syncBundleHealth(admin, bundle.id, shop);
  } catch (error) {
    // Only forward messages we already curated as safe (UserFacingError).
    // Anything else (Prisma/network/unexpected) is logged, never shown raw.
    if (error instanceof UserFacingError) {
      await rollbackProduct(error.message);
    } else {
      console.error(
        "[BundleGuard] createBundle failed saving bundle after Shopify product create",
        error,
      );
      await rollbackProduct(
        "Failed to save bundle after Shopify product create. The Shopify product was rolled back.",
      );
    }
    throw error;
  }
}

export async function runOosAudit(shop: string): Promise<AuditIssue[]> {
  const bundles = await getBundlesForShop(shop);
  const issues: AuditIssue[] = [];

  for (const bundle of bundles) {
    for (const component of bundle.components) {
      if (component.inventoryPolicy === "CONTINUE") {
        issues.push({
          bundleId: bundle.id,
          bundleTitle: bundle.title,
          componentTitle: `${component.productTitle} — ${component.variantTitle}`,
          issue:
            "Component allows continue selling when out of stock, which breaks bundle availability calculations",
          severity: "critical",
          fixAction:
            "Set inventory policy to 'Deny' for this component or enable 'Ignore continue-selling components' rule on the bundle",
        });
      }

      if (
        component.inventoryPolicy !== "NOT_TRACKED" &&
        component.availableQty < component.quantity &&
        bundle.status !== "healthy"
      ) {
        issues.push({
          bundleId: bundle.id,
          bundleTitle: bundle.title,
          componentTitle: `${component.productTitle} — ${component.variantTitle}`,
          issue: `Insufficient stock (${component.availableQty} available, ${component.quantity} required per bundle)`,
          severity: "warning",
          fixAction: "Restock component or run bundle resync after inventory update",
        });
      }
    }
  }

  return issues;
}

export async function deleteBundle(
  shop: string,
  bundleId: string,
  options?: {
    admin?: AdminGraphql;
    deleteShopifyProduct?: boolean;
  },
) {
  const bundle = await getBundleById(shop, bundleId);
  if (!bundle) {
    throw new UserFacingError("Bundle not found");
  }

  if (options?.deleteShopifyProduct && options.admin && bundle.productId) {
    const response = await options.admin.graphql(
      `#graphql
        mutation BundleGuardDeleteProduct($input: ProductDeleteInput!) {
          productDelete(input: $input) {
            deletedProductId
            userErrors { field message }
          }
        }`,
      { variables: { input: { id: bundle.productId } } },
    );
    const json = (await response.json()) as {
      data?: {
        productDelete?: {
          deletedProductId?: string | null;
          userErrors?: Array<{ message: string }>;
        };
      };
      errors?: Array<{ message: string }>;
    };
    const errors = [
      ...(json.errors?.map((e) => e.message) ?? []),
      ...(json.data?.productDelete?.userErrors?.map((e) => e.message) ?? []),
    ];
    if (errors.length > 0) {
      throw new UserFacingError(
        `Could not delete Shopify product: ${errors.join("; ")}. Bundle record was not removed.`,
      );
    }
  }

  try {
    await prisma.inventoryAlert.deleteMany({ where: { shop, bundleId } });
    await prisma.bundle.delete({ where: { id: bundle.id } });
  } catch (error) {
    console.error("[BundleGuard] deleteBundle DB delete failed", error);
    throw new UserFacingError(
      "Could not remove the bundle record. Please try again.",
    );
  }
  return bundle;
}
