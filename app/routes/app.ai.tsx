import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getAssistantSettings } from "../services/chat.server";
import {
  getShopperSettings,
  getRecentBuyerMessages,
} from "../services/buyer-assistant.server";
import { fetchFullStoreCatalog } from "../services/catalog.server";
import { getPlanContext } from "../services/plan-access.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, billing, session } = await authenticate.admin(request);
  const { features, planName, billingEnforced } = await getPlanContext(billing);

  let catalogCount = 0;
  let catalogError: string | null = null;
  try {
    const catalog = await fetchFullStoreCatalog(admin, session.shop);
    catalogCount = catalog.productCount;
  } catch (error) {
    catalogError =
      error instanceof Error ? error.message : "Could not load catalog";
  }

  const [merchant, shopper, buyerMessages] = await Promise.all([
    getAssistantSettings(session.shop),
    getShopperSettings(session.shop),
    getRecentBuyerMessages(session.shop),
  ]);

  return {
    merchant,
    shopperEnabled: shopper.buyerEnabled,
    buyerMessageCount: buyerMessages.length,
    catalogCount,
    catalogError,
    features,
    planName,
    billingEnforced,
  };
};

export default function AiHubPage() {
  const {
    merchant,
    shopperEnabled,
    buyerMessageCount,
    catalogCount,
    catalogError,
    features,
    planName,
    billingEnforced,
  } = useLoaderData<typeof loader>();

  return (
    <s-page heading="AI Assistants">
      <s-link slot="breadcrumb-actions" href="/app">
        Dashboard
      </s-link>

      <s-paragraph>
        Two assistants in one place: merchant inventory help inside Admin, and
        storefront Shopper AI for buyers.
      </s-paragraph>

      {catalogError && (
        <s-banner heading="Catalog load issue" tone="warning">
          {catalogError}
        </s-banner>
      )}

      {!billingEnforced && (
        <s-banner heading="Dev unlock" tone="info">
          Billing is not enforced locally — Pro AI features are unlocked for
          testing. Production requires Growth (merchant) / Pro (shopper).
        </s-banner>
      )}

      {billingEnforced && (
        <s-banner heading={`Current plan: ${planName ?? "none"}`} tone="info">
          Merchant AI needs Growth+. Shopper AI needs Pro.
        </s-banner>
      )}

      <s-section heading="Merchant Assistant">
        <s-box padding="base" border="base" borderRadius="base">
          <s-stack direction="block" gap="base">
            <s-badge tone={features.merchantAi ? "success" : "warning"}>
              {features.merchantAi ? "Included" : "Growth plan"}
            </s-badge>
            <s-paragraph>
              Ask about blocked bundles, low stock, and location gaps.
              {merchant.connectedShop
                ? ` Connected: ${merchant.connectedShop}`
                : ""}
            </s-paragraph>
            {features.merchantAi ? (
              <s-button href="/app/chat" variant="primary">
                Open merchant chat
              </s-button>
            ) : (
              <s-button href="/app/pricing" variant="primary">
                Upgrade for merchant AI
              </s-button>
            )}
          </s-stack>
        </s-box>
      </s-section>

      <s-section heading="Shopper Assistant">
        <s-box padding="base" border="base" borderRadius="base">
          <s-stack direction="block" gap="base">
            <s-badge tone={features.shopperAi ? "success" : "warning"}>
              {features.shopperAi ? "Included" : "Pro plan"}
            </s-badge>
            <s-paragraph>
              Storefront widget · {shopperEnabled ? "Enabled" : "Disabled"} ·{" "}
              {catalogCount} catalog products · {buyerMessageCount} messages
            </s-paragraph>
            {features.shopperAi ? (
              <s-button href="/app/shopper" variant="primary">
                Open shopper settings
              </s-button>
            ) : (
              <s-button href="/app/pricing" variant="primary">
                Upgrade for Shopper AI
              </s-button>
            )}
          </s-stack>
        </s-box>
      </s-section>

      <s-section heading="More">
        <s-unordered-list>
          <s-list-item>
            <s-link href="/app/assistant/analytics">Assistant analytics</s-link>
          </s-list-item>
          <s-list-item>
            <s-link href="/app/assistant/conversations">
              Assistant conversations
            </s-link>
          </s-list-item>
          <s-list-item>
            <s-link href="/app/assistant/settings">Assistant settings</s-link>
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
