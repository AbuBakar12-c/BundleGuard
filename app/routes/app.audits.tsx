import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData, useSearchParams } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  getBundlesForShop,
  runOosAudit,
  syncAllBundles,
} from "../services/bundles.server";
import { sellableKitsByLocation } from "../services/location-audit.server";
import prisma from "../db.server";
import {
  getPlanContext,
  requireFeature,
} from "../services/plan-access.server";

type LocationReport = {
  bundleId: string;
  title: string;
  availableQuantity: number;
  status: string;
  lastSyncedAt: string | null;
  kits: Array<{
    locationId: string;
    locationName: string;
    kits: number;
    fulfillsOnlineOrders: boolean;
  }>;
  gaps: Array<{
    kind: string;
    severity: string;
    message: string;
  }>;
  rows: Array<{
    sku: string | null;
    productTitle: string;
    variantTitle: string;
    mapped: boolean;
    locationName: string;
    fulfillsOnlineOrders: boolean;
    onHand: number;
    available: number;
    committed: number;
    reserved: number;
  }>;
};

function reportsFromSync(
  results: Awaited<ReturnType<typeof syncAllBundles>>,
): LocationReport[] {
  return results.map((result) => {
    const bundle = result.bundle;
    return {
      bundleId: bundle?.id ?? "",
      title: bundle?.title ?? "Untitled bundle",
      availableQuantity: result.health.availableQuantity,
      status: result.health.status,
      lastSyncedAt: bundle?.lastSyncedAt?.toISOString() ?? new Date().toISOString(),
      kits: sellableKitsByLocation(result.snapshots),
      gaps: result.locationGaps.map((gap) => ({
        kind: gap.kind,
        severity: gap.severity,
        message: gap.message,
      })),
      rows: result.snapshots.flatMap((snapshot) =>
        snapshot.locations.map((location) => ({
          sku: snapshot.sku,
          productTitle: snapshot.productTitle,
          variantTitle: snapshot.variantTitle,
          mapped: snapshot.mapped,
          locationName: location.locationName,
          fulfillsOnlineOrders: location.fulfillsOnlineOrders,
          onHand: location.onHand,
          available: location.available,
          committed: location.committed,
          reserved: location.reserved,
        })),
      ),
    };
  });
}

async function cachedLocationReports(shop: string): Promise<LocationReport[]> {
  const [bundles, alerts] = await Promise.all([
    getBundlesForShop(shop),
    prisma.inventoryAlert.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return bundles.map((bundle) => {
    const bundleAlerts = alerts.filter((alert) => alert.bundleId === bundle.id);
    return {
      bundleId: bundle.id,
      title: bundle.title,
      availableQuantity: bundle.availableQuantity,
      status: bundle.status,
      lastSyncedAt: bundle.lastSyncedAt?.toISOString() ?? null,
      kits: [],
      gaps: bundleAlerts.map((alert) => ({
        kind: alert.kind,
        severity: alert.severity,
        message: alert.message,
      })),
      rows: bundle.components.map((component) => ({
        sku: component.sku,
        productTitle: component.productTitle,
        variantTitle: component.variantTitle,
        mapped: true,
        locationName: "All locations (last sync total)",
        fulfillsOnlineOrders: true,
        onHand: component.availableQty,
        available: component.availableQty,
        committed: 0,
        reserved: 0,
      })),
    };
  });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const { features, planName } = await getPlanContext(billing);
  const url = new URL(request.url);
  const tab = url.searchParams.get("tab") === "locations" ? "locations" : "oos";

  if (tab === "oos") {
    requireFeature(features, "oosAudit");
    const issues = await runOosAudit(session.shop);
    return {
      tab,
      issues,
      reports: [] as LocationReport[],
      planName,
      liveScan: false,
    };
  }

  requireFeature(features, "locationAudit");
  const reports = await cachedLocationReports(session.shop);
  return { tab, issues: [] as never[], reports, planName, liveScan: false };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, billing, session } = await authenticate.admin(request);
  const { features } = await getPlanContext(billing);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "resync");

  if (intent === "oos") {
    requireFeature(features, "oosAudit");
    await syncAllBundles(admin, session.shop);
    const issues = await runOosAudit(session.shop);
    return { issues, message: "Audit refreshed after resync" };
  }

  requireFeature(features, "locationAudit");
  const results = await syncAllBundles(admin, session.shop);
  return {
    ok: true,
    message: "Locations rescanned",
    reports: reportsFromSync(results),
  };
};

function AuditsNav({ active }: { active: "oos" | "locations" }) {
  return (
    <s-section>
      <s-stack direction="inline" gap="base">
        {active === "oos" ? (
          <s-text type="strong">OOS policy</s-text>
        ) : (
          <s-link href="/app/audits?tab=oos">OOS policy</s-link>
        )}
        {active === "locations" ? (
          <s-text type="strong">Locations</s-text>
        ) : (
          <s-link href="/app/audits?tab=locations">Locations</s-link>
        )}
      </s-stack>
    </s-section>
  );
}

export default function AuditsPage() {
  const data = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const tab =
    searchParams.get("tab") === "locations" || data.tab === "locations"
      ? "locations"
      : "oos";
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  if (tab === "locations") {
    const reports =
      fetcher.data &&
      "reports" in fetcher.data &&
      Array.isArray(fetcher.data.reports)
        ? fetcher.data.reports
        : data.reports;
    const gapCount = reports.reduce(
      (sum, report) => sum + report.gaps.length,
      0,
    );

    return (
      <s-page heading="Audits">
        <s-link slot="breadcrumb-actions" href="/app">
          Dashboard
        </s-link>
        <s-button
          slot="primary-action"
          onClick={() => {
            fetcher.submit({ intent: "locations" }, { method: "POST" });
            shopify.toast.show("Rescanning locations…");
          }}
          {...(fetcher.state !== "idle" ? { loading: true } : {})}
        >
          Rescan locations
        </s-button>

        <AuditsNav active="locations" />

        <s-banner heading="Cached until you rescan" tone="info">
          This page loads last-synced inventory from your database (no heavy
          Shopify sync on every visit). Click <strong>Rescan locations</strong>{" "}
          for a live multi-location pass.
        </s-banner>

        <s-paragraph>
          Compares Shopify on-hand with available stock for every component.
          Per-location kit counts refresh when you rescan.
        </s-paragraph>

        {gapCount === 0 ? (
          <s-banner heading="No location gaps" tone="success">
            Every mapped component can form a complete kit at fulfillment
            locations, or you have not created a bundle yet.
          </s-banner>
        ) : (
          <s-banner heading={`${gapCount} location issues`} tone="warning">
            Blocked alerts fire when a kit cannot be assembled at a location that
            fulfills online orders.
          </s-banner>
        )}

        {reports.map((report) => (
          <s-section key={report.bundleId} heading={report.title}>
            <s-stack direction="inline" gap="base">
              <s-badge
                tone={
                  report.status === "healthy"
                    ? "success"
                    : report.status === "warning"
                      ? "warning"
                      : "critical"
                }
              >
                {report.status}
              </s-badge>
              <s-text>
                {report.availableQuantity} kits sellable (last sync)
              </s-text>
              {report.lastSyncedAt && (
                <s-text tone="neutral">
                  Synced {new Date(report.lastSyncedAt).toLocaleString()}
                </s-text>
              )}
              <s-link href={`/app/bundles/${report.bundleId}`}>Open bundle</s-link>
            </s-stack>

            {report.gaps.map((gap, index) => (
              <s-box
                key={`${gap.kind}-${index}`}
                padding="base"
                border="base"
                borderRadius="base"
                background="subdued"
              >
                <s-badge
                  tone={gap.severity === "blocked" ? "critical" : "warning"}
                >
                  {gap.severity}
                </s-badge>
                <s-paragraph>{gap.message}</s-paragraph>
              </s-box>
            ))}

            {report.rows.length > 0 && (
              <s-table>
                <s-table-header-row>
                  <s-table-header listSlot="primary">SKU</s-table-header>
                  <s-table-header>Variant</s-table-header>
                  <s-table-header>Location</s-table-header>
                  <s-table-header>On-hand</s-table-header>
                  <s-table-header>Available</s-table-header>
                  <s-table-header>Committed</s-table-header>
                </s-table-header-row>
                <s-table-body>
                  {report.rows.map((row, index) => (
                    <s-table-row
                      key={`${row.sku}-${row.locationName}-${index}`}
                    >
                      <s-table-cell>{row.sku || "No SKU"}</s-table-cell>
                      <s-table-cell>
                        {row.productTitle} — {row.variantTitle}
                      </s-table-cell>
                      <s-table-cell>
                        {row.locationName}
                        {row.fulfillsOnlineOrders ? " (online)" : ""}
                      </s-table-cell>
                      <s-table-cell>{row.onHand}</s-table-cell>
                      <s-table-cell>{row.available}</s-table-cell>
                      <s-table-cell>{row.committed}</s-table-cell>
                    </s-table-row>
                  ))}
                </s-table-body>
              </s-table>
            )}
          </s-section>
        ))}
      </s-page>
    );
  }

  const issues =
    fetcher.data && "issues" in fetcher.data && fetcher.data.issues
      ? fetcher.data.issues
      : data.issues;

  return (
    <s-page heading="Audits">
      <s-link slot="breadcrumb-actions" href="/app">
        Dashboard
      </s-link>
      <s-button
        slot="primary-action"
        onClick={() => {
          fetcher.submit({ intent: "oos" }, { method: "POST" });
          shopify.toast.show("Refreshing OOS audit…");
        }}
        {...(fetcher.state !== "idle" ? { loading: true } : {})}
      >
        Refresh audit
      </s-button>

      <AuditsNav active="oos" />

      <s-paragraph>
        Finds components that allow continue-selling when out of stock, or that
        are short for kit assembly.
      </s-paragraph>

      {issues.length === 0 ? (
        <s-banner heading="No OOS policy issues" tone="success">
          Component inventory policies look compatible with bundle math.
        </s-banner>
      ) : (
        <s-stack direction="block" gap="base">
          {issues.map((issue, index) => (
            <s-box
              key={`${issue.bundleId}-${index}`}
              padding="base"
              border="base"
              borderRadius="base"
            >
              <s-badge
                tone={issue.severity === "critical" ? "critical" : "warning"}
              >
                {issue.severity}
              </s-badge>
              <s-text type="strong">{issue.bundleTitle}</s-text>
              <s-paragraph>{issue.componentTitle}</s-paragraph>
              <s-paragraph>{issue.issue}</s-paragraph>
              <s-paragraph>{issue.fixAction}</s-paragraph>
              <s-link href={`/app/bundles/${issue.bundleId}`}>Open bundle</s-link>
            </s-box>
          ))}
        </s-stack>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
