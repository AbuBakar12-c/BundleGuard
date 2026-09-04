import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  getBundlesForShop,
  syncAllBundles,
} from "../services/bundles.server";
import { getUnreadAlerts, markAlertsRead } from "../services/alerts.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const bundles = await getBundlesForShop(session.shop);
  const alerts = await getUnreadAlerts(session.shop);

  const summary = {
    total: bundles.length,
    healthy: bundles.filter((b) => b.status === "healthy").length,
    warning: bundles.filter((b) => b.status === "warning").length,
    blocked: bundles.filter((b) => b.status === "blocked").length,
  };

  const blockedBundles = bundles
    .filter((b) => b.status === "blocked")
    .slice(0, 5);

  const recentlysynced = bundles
    .filter((b) => b.lastSyncedAt)
    .sort(
      (a, b) =>
        new Date(b.lastSyncedAt!).getTime() -
        new Date(a.lastSyncedAt!).getTime(),
    )
    .slice(0, 3);

  const totalAvailable = bundles.reduce(
    (sum, b) => sum + b.availableQuantity,
    0,
  );
  const totalComponents = bundles.reduce(
    (sum, b) => sum + b.components.length,
    0,
  );

  return {
    bundles,
    summary,
    alerts,
    blockedBundles,
    recentlysynced,
    totalAvailable,
    totalComponents,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "resync-all") {
    await syncAllBundles(admin, session.shop);
    return { ok: true, message: "All bundles resynced" };
  }

  if (intent === "dismiss-alerts") {
    await markAlertsRead(session.shop);
    return { ok: true };
  }

  return { ok: false };
};

function statusBadgeTone(status: string) {
  if (status === "healthy") return "success";
  if (status === "warning") return "warning";
  return "critical";
}

function healthPercent(healthy: number, total: number) {
  if (total === 0) return 100;
  return Math.round((healthy / total) * 100);
}

export default function Dashboard() {
  const {
    bundles,
    summary,
    alerts,
    blockedBundles,
    recentlysynced,
    totalAvailable,
    totalComponents,
  } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const isResyncing =
    fetcher.state !== "idle" &&
    fetcher.formData?.get("intent") === "resync-all";

  const pct = healthPercent(summary.healthy, summary.total);

  return (
    <s-page heading="Bundle Health Dashboard">
      <s-button slot="primary-action" href="/app/bundles/new" variant="primary">
        Create bundle
      </s-button>
      <s-button
        slot="secondary-actions"
        onClick={() => {
          fetcher.submit({ intent: "resync-all" }, { method: "POST" });
          shopify.toast.show("Resyncing all bundles…");
        }}
        {...(isResyncing ? { loading: true } : {})}
      >
        Resync all
      </s-button>

      {/* ── Blocked location alerts ── */}
      {alerts.length > 0 && (
        <s-banner
          heading={`${alerts.length} blocked location alert${alerts.length > 1 ? "s" : ""}`}
          tone="critical"
          dismissible
        >
          <s-stack direction="block" gap="base">
            {alerts.slice(0, 3).map((alert) => (
              <s-paragraph key={alert.id}>{alert.message}</s-paragraph>
            ))}
            {alerts.length > 3 && (
              <s-paragraph>
                +{alerts.length - 3} more issues
              </s-paragraph>
            )}
            <s-stack direction="inline" gap="base">
              <s-link href="/app/audits?tab=locations">Open location audit</s-link>
              <s-button
                variant="tertiary"
                onClick={() =>
                  fetcher.submit(
                    { intent: "dismiss-alerts" },
                    { method: "POST" },
                  )
                }
              >
                Dismiss
              </s-button>
            </s-stack>
          </s-stack>
        </s-banner>
      )}

      {/* ── Metrics row ── */}
      <s-section heading="Overview">
        <s-grid gridTemplateColumns="1fr 1fr 1fr 1fr" gap="base">
          <s-box padding="base" border="base" borderRadius="base">
            <s-text type="strong" tone="neutral">
              Total bundles
            </s-text>
            <s-heading>{summary.total}</s-heading>
            <s-paragraph>{totalComponents} components tracked</s-paragraph>
          </s-box>

          <s-box padding="base" border="base" borderRadius="base">
            <s-text type="strong" tone="neutral">
              Health score
            </s-text>
            <s-heading>{pct}%</s-heading>
            <s-badge tone={pct === 100 ? "success" : pct >= 80 ? "warning" : "critical"}>
              {summary.healthy} of {summary.total} healthy
            </s-badge>
          </s-box>

          <s-box padding="base" border="base" borderRadius="base">
            <s-text type="strong" tone="neutral">
              Sellable kits
            </s-text>
            <s-heading>{totalAvailable}</s-heading>
            <s-paragraph>Across all bundles</s-paragraph>
          </s-box>

          <s-box padding="base" border="base" borderRadius="base">
            <s-text type="strong" tone="neutral">
              Issues
            </s-text>
            <s-heading>{summary.warning + summary.blocked}</s-heading>
            <s-stack direction="inline" gap="base">
              {summary.warning > 0 && (
                <s-badge tone="warning">{summary.warning} warning</s-badge>
              )}
              {summary.blocked > 0 && (
                <s-badge tone="critical">{summary.blocked} blocked</s-badge>
              )}
              {summary.warning + summary.blocked === 0 && (
                <s-badge tone="success">All clear</s-badge>
              )}
            </s-stack>
          </s-box>
        </s-grid>
      </s-section>

      {/* ── Empty state ── */}
      {bundles.length === 0 ? (
        <s-section heading="Get started">
          <s-box padding="base" border="base" borderRadius="base">
            <s-stack direction="block" gap="base">
              <s-heading>No bundles yet</s-heading>
              <s-paragraph>
                Create your first bundle to start tracking component inventory,
                auditing OOS policies, and preventing overselling. BundleGuard
                monitors real-time stock levels across all your warehouses.
              </s-paragraph>
              <s-stack direction="inline" gap="base">
                <s-button href="/app/bundles/new" variant="primary">
                  Create your first bundle
                </s-button>
                <s-button href="/app/audits?tab=oos" variant="secondary">
                  Run OOS audit
                </s-button>
              </s-stack>
            </s-stack>
          </s-box>
        </s-section>
      ) : (
        <>
          {/* ── Top blocked bundles ── */}
          {blockedBundles.length > 0 && (
            <s-section heading="Needs attention">
              <s-stack direction="block" gap="base">
                {blockedBundles.map((bundle) => (
                  <s-box
                    key={bundle.id}
                    padding="base"
                    border="base"
                    borderRadius="base"
                    background="subdued"
                  >
                    <s-stack direction="inline" gap="base">
                      <s-badge tone="critical">blocked</s-badge>
                      <s-link href={`/app/bundles/${bundle.id}`}>
                        <s-text type="strong">{bundle.title}</s-text>
                      </s-link>
                    </s-stack>
                    {bundle.blockReason && (
                      <s-paragraph>{bundle.blockReason}</s-paragraph>
                    )}
                    <s-stack direction="inline" gap="base">
                      <s-text tone="neutral">
                        {bundle.components.length} components · {bundle.availableQuantity} kits
                      </s-text>
                      {bundle.lastSyncedAt && (
                        <s-text tone="neutral">
                          Synced {new Date(bundle.lastSyncedAt).toLocaleString()}
                        </s-text>
                      )}
                    </s-stack>
                  </s-box>
                ))}
              </s-stack>
            </s-section>
          )}

          {/* ── All bundles table ── */}
          <s-section heading="All bundles">
            <s-table>
              <s-table-header-row>
                <s-table-header listSlot="primary">Bundle</s-table-header>
                <s-table-header>Status</s-table-header>
                <s-table-header>Kits</s-table-header>
                <s-table-header>Components</s-table-header>
                <s-table-header>Last synced</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {bundles.map((bundle) => (
                  <s-table-row key={bundle.id}>
                    <s-table-cell>
                      <s-link href={`/app/bundles/${bundle.id}`}>
                        {bundle.title}
                      </s-link>
                    </s-table-cell>
                    <s-table-cell>
                      <s-badge tone={statusBadgeTone(bundle.status)}>
                        {bundle.status}
                      </s-badge>
                    </s-table-cell>
                    <s-table-cell>{bundle.availableQuantity}</s-table-cell>
                    <s-table-cell>{bundle.components.length}</s-table-cell>
                    <s-table-cell>
                      {bundle.lastSyncedAt
                        ? new Date(bundle.lastSyncedAt).toLocaleString()
                        : "Never"}
                    </s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
          </s-section>

          {/* ── Recent activity ── */}
          {recentlysynced.length > 0 && (
            <s-section heading="Recent activity">
              <s-stack direction="block" gap="base">
                {recentlysynced.map((bundle) => (
                  <s-box key={bundle.id} padding="base" border="base" borderRadius="base">
                    <s-stack direction="inline" gap="base">
                      <s-badge tone={statusBadgeTone(bundle.status)}>
                        {bundle.status}
                      </s-badge>
                      <s-link href={`/app/bundles/${bundle.id}`}>
                        {bundle.title}
                      </s-link>
                      <s-text tone="neutral">
                        synced {new Date(bundle.lastSyncedAt!).toLocaleString()}
                      </s-text>
                    </s-stack>
                  </s-box>
                ))}
              </s-stack>
            </s-section>
          )}
        </>
      )}

      {/* ── Sidebar ── */}
      <s-section slot="aside" heading="Quick actions">
        <s-stack direction="block" gap="base">
          <s-box padding="base" border="base" borderRadius="base">
            <s-text type="strong">Audit tools</s-text>
            <s-unordered-list>
              <s-list-item>
                <s-link href="/app/audits?tab=oos">OOS policy audit</s-link>
              </s-list-item>
              <s-list-item>
                <s-link href="/app/audits?tab=locations">Multi-location audit</s-link>
              </s-list-item>
              <s-list-item>
                <s-link href="/app/ai">AI assistants</s-link>
              </s-list-item>
            </s-unordered-list>
          </s-box>

          <s-box padding="base" border="base" borderRadius="base">
            <s-text type="strong">Manage</s-text>
            <s-unordered-list>
              <s-list-item>
                <s-link href="/app/bundles/new">Create new bundle</s-link>
              </s-list-item>
              <s-list-item>
                <s-link href="/app/pricing">View plan</s-link>
              </s-list-item>
            </s-unordered-list>
          </s-box>

          {summary.total > 0 && (
            <s-box padding="base" border="base" borderRadius="base">
              <s-text type="strong">Inventory snapshot</s-text>
              <s-paragraph>
                {summary.healthy} healthy · {summary.warning} warning · {summary.blocked} blocked
              </s-paragraph>
              <s-paragraph>
                {totalAvailable} total sellable kits across {summary.total} bundles
              </s-paragraph>
            </s-box>
          )}
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
