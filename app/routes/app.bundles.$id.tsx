import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { redirect, useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  deleteBundle,
  getBundleById,
  syncBundleHealth,
} from "../services/bundles.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const bundle = await getBundleById(session.shop, params.id!);

  if (!bundle) {
    throw new Response("Bundle not found", { status: 404 });
  }

  const healthyComponents = bundle.components.filter(
    (c) =>
      c.inventoryPolicy !== "CONTINUE" &&
      c.inventoryPolicy !== "NOT_TRACKED" &&
      c.availableQty >= c.quantity,
  ).length;
  const totalTracked = bundle.components.filter(
    (c) => c.inventoryPolicy !== "NOT_TRACKED",
  ).length;

  return { bundle, healthyComponents, totalTracked };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "resync") {
    const result = await syncBundleHealth(admin, params.id!, session.shop);
    return { ok: true, health: result.health };
  }

  if (intent === "delete") {
    const deleteShopifyProduct = formData.get("deleteShopifyProduct") === "on";
    try {
      await deleteBundle(session.shop, params.id!, {
        admin,
        deleteShopifyProduct,
      });
      return redirect("/app");
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error ? error.message : "Failed to delete bundle",
      };
    }
  }

  return { ok: false };
};

function statusBadgeTone(status: string) {
  if (status === "healthy") return "success";
  if (status === "warning") return "warning";
  return "critical";
}

function policyLabel(policy: string) {
  if (policy === "CONTINUE") return "Continue selling";
  if (policy === "NOT_TRACKED") return "Not tracked";
  if (policy === "DENY") return "Stop selling at 0";
  return policy;
}

function componentTone(
  component: { availableQty: number; quantity: number; inventoryPolicy: string },
) {
  if (component.inventoryPolicy === "NOT_TRACKED") return "info";
  if (component.inventoryPolicy === "CONTINUE") return "warning";
  if (component.availableQty < component.quantity) return "critical";
  return "success";
}

export default function BundleDetail() {
  const { bundle, healthyComponents, totalTracked } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const isResyncing =
    fetcher.state !== "idle" && fetcher.formData?.get("intent") === "resync";

  return (
    <s-page heading={bundle.title}>
      <s-link slot="breadcrumb-actions" href="/app">
        Dashboard
      </s-link>
      <s-button
        slot="primary-action"
        onClick={() => {
          fetcher.submit({ intent: "resync" }, { method: "POST" });
          shopify.toast.show("Resyncing bundle inventory…");
        }}
        {...(isResyncing ? { loading: true } : {})}
      >
        Resync inventory
      </s-button>

      {/* ── Health overview ── */}
      <s-section heading="Health status">
        <s-grid gridTemplateColumns="1fr 1fr 1fr" gap="base">
          <s-box padding="base" border="base" borderRadius="base">
            <s-text type="strong" tone="neutral">Status</s-text>
            <s-badge tone={statusBadgeTone(bundle.status)}>
              {bundle.status}
            </s-badge>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text type="strong" tone="neutral">Sellable kits</s-text>
            <s-heading>{bundle.availableQuantity}</s-heading>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text type="strong" tone="neutral">Component health</s-text>
            <s-heading>
              {healthyComponents}/{totalTracked}
            </s-heading>
            <s-paragraph>components in stock</s-paragraph>
          </s-box>
        </s-grid>

        {bundle.blockReason && (
          <s-banner tone="critical" heading="Blocked">
            {bundle.blockReason}
          </s-banner>
        )}
        {bundle.lastSyncedAt && (
          <s-paragraph>
            Last synced: {new Date(bundle.lastSyncedAt).toLocaleString()}
          </s-paragraph>
        )}
      </s-section>

      {/* ── Components table ── */}
      <s-section heading={`Components (${bundle.components.length})`}>
        <s-table>
          <s-table-header-row>
            <s-table-header listSlot="primary">Product</s-table-header>
            <s-table-header>SKU</s-table-header>
            <s-table-header>Required</s-table-header>
            <s-table-header>Available</s-table-header>
            <s-table-header>Policy</s-table-header>
            <s-table-header>Status</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {bundle.components.map((component) => {
              const tone = componentTone(component);
              const enough = component.availableQty >= component.quantity;
              return (
                <s-table-row key={component.id}>
                  <s-table-cell>
                    <s-text type="strong">{component.productTitle}</s-text>
                    <s-paragraph>{component.variantTitle}</s-paragraph>
                  </s-table-cell>
                  <s-table-cell>
                    {component.sku || <s-text tone="neutral">No SKU</s-text>}
                  </s-table-cell>
                  <s-table-cell>{component.quantity}</s-table-cell>
                  <s-table-cell>{component.availableQty}</s-table-cell>
                  <s-table-cell>
                    <s-badge tone={tone === "warning" ? "warning" : "info"}>
                      {policyLabel(component.inventoryPolicy)}
                    </s-badge>
                  </s-table-cell>
                  <s-table-cell>
                    {component.inventoryPolicy === "NOT_TRACKED" ? (
                      <s-badge tone="info">Not tracked</s-badge>
                    ) : enough ? (
                      <s-badge tone="success">In stock</s-badge>
                    ) : (
                      <s-badge tone="critical">
                        Short {component.quantity - component.availableQty}
                      </s-badge>
                    )}
                  </s-table-cell>
                </s-table-row>
              );
            })}
          </s-table-body>
        </s-table>
      </s-section>

      {/* ── Shopify product info ── */}
      <s-section heading="Shopify product">
        <s-stack direction="block" gap="base">
          <s-box padding="base" border="base" borderRadius="base">
            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
              <s-box>
                <s-text type="strong" tone="neutral">Product ID</s-text>
                <s-paragraph>{bundle.productId}</s-paragraph>
              </s-box>
              <s-box>
                <s-text type="strong" tone="neutral">Variant ID</s-text>
                <s-paragraph>{bundle.productVariantId}</s-paragraph>
              </s-box>
            </s-grid>
          </s-box>
          <s-stack direction="inline" gap="base">
            <s-button
              onClick={() => {
                shopify.intents.invoke?.("edit:shopify/Product", {
                  value: bundle.productId,
                });
              }}
              variant="tertiary"
            >
              Edit in Shopify Admin
            </s-button>
            <s-link href="/app/audits?tab=locations">Check location inventory</s-link>
          </s-stack>
        </s-stack>
      </s-section>

      {/* ── Sidebar ── */}
      <s-section slot="aside" heading="Bundle info">
        <s-stack direction="block" gap="base">
          <s-box padding="base" border="base" borderRadius="base">
            <s-text type="strong">OOS rule</s-text>
            <s-paragraph>
              {bundle.oosRule === "block_when_any_component_oos"
                ? "Block when any component is out of stock"
                : bundle.oosRule === "allow_partial_with_warning"
                  ? "Allow with warning"
                  : "Ignore continue-selling components"}
            </s-paragraph>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text type="strong">Price</s-text>
            <s-paragraph>${bundle.price}</s-paragraph>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text type="strong">Created</s-text>
            <s-paragraph>
              {new Date(bundle.createdAt).toLocaleDateString()}
            </s-paragraph>
          </s-box>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Danger zone">
        {fetcher.data &&
          "error" in fetcher.data &&
          fetcher.data.error && (
            <s-banner tone="critical" heading="Delete failed">
              {fetcher.data.error}
            </s-banner>
          )}
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="delete" />
          <s-stack direction="block" gap="base">
            <label>
              <input type="checkbox" name="deleteShopifyProduct" /> Also delete
              the Shopify product (cannot be undone)
            </label>
            <s-button tone="critical" type="submit" variant="secondary">
              Delete bundle
            </s-button>
          </s-stack>
        </fetcher.Form>
        <s-paragraph>
          By default only BundleGuard tracking is removed. Check the box to also
          remove the Shopify product created for this kit.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
