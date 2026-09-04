import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  getRecentBuyerMessages,
  getShopperSettings,
  updateShopperSettings,
} from "../services/buyer-assistant.server";
import {
  clearCatalogCache,
  fetchFullStoreCatalog,
} from "../services/catalog.server";
import {
  getLeadDailyTrend,
  getLeadStats,
  listShopperLeads,
  updateLeadStatus,
  type LeadStatus,
} from "../services/leads.server";
import {
  getPlanContext,
  requireFeature,
} from "../services/plan-access.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, billing, session } = await authenticate.admin(request);
  const { features } = await getPlanContext(billing);
  requireFeature(features, "shopperAi");

  let catalogCount = 0;
  let shopName = session.shop;
  let catalogError: string | null = null;

  try {
    const catalog = await fetchFullStoreCatalog(admin, session.shop);
    catalogCount = catalog.productCount;
    shopName = catalog.shopName;
  } catch (error) {
    catalogError =
      error instanceof Error ? error.message : "Could not load catalog";
  }

  const [settings, messages, leadStats, leadTrend, leads] = await Promise.all([
    getShopperSettings(session.shop),
    getRecentBuyerMessages(session.shop),
    getLeadStats(session.shop),
    getLeadDailyTrend(session.shop, 7),
    listShopperLeads(session.shop, 40),
  ]);

  return {
    shop: session.shop,
    settings,
    messageCount: messages.length,
    recentMessages: messages.slice(0, 8),
    catalogCount,
    catalogError,
    shopName,
    leadStats,
    leadTrend,
    leads,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, billing, session } = await authenticate.admin(request);
  const { features } = await getPlanContext(billing);
  requireFeature(features, "shopperAi");
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "save");

  if (intent === "save") {
    const buyerEnabled = formData.get("buyerEnabled") === "on";
    const welcomeMessage = String(formData.get("welcomeMessage") ?? "").trim();

    await updateShopperSettings(session.shop, {
      buyerEnabled,
      welcomeMessage:
        welcomeMessage ||
        "Hi! I can help you find products and check what's in stock.",
    });
    clearCatalogCache(session.shop);

    return { ok: true };
  }

  if (intent === "refresh-catalog") {
    clearCatalogCache(session.shop);
    try {
      const catalog = await fetchFullStoreCatalog(admin, session.shop, {
        forceRefresh: true,
      });
      return {
        ok: true,
        refreshed: true,
        catalogCount: catalog.productCount,
      };
    } catch (error) {
      return {
        ok: false,
        refreshed: false,
        error:
          error instanceof Error ? error.message : "Catalog refresh failed",
      };
    }
  }

  if (intent === "lead-status") {
    const leadId = String(formData.get("leadId") ?? "");
    const status = String(formData.get("status") ?? "") as LeadStatus;
    const allowed: LeadStatus[] = [
      "pending",
      "captured",
      "contacted",
      "qualified",
    ];
    if (!leadId || !allowed.includes(status)) {
      return { ok: false };
    }
    await updateLeadStatus(session.shop, leadId, status);
    return { ok: true };
  }

  return { ok: false };
};

function LeadTrendChart({
  trend,
}: {
  trend: Array<{ date: string; count: number; label: string }>;
}) {
  const max = Math.max(1, ...trend.map((d) => d.count));
  const width = 420;
  const height = 140;
  const pad = 24;
  const barGap = 8;
  const barWidth = (width - pad * 2 - barGap * (trend.length - 1)) / trend.length;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      style={{ maxWidth: 480, display: "block" }}
      role="img"
      aria-label="Leads captured over the last 7 days"
    >
      {trend.map((day, index) => {
        const h = (day.count / max) * (height - pad * 1.5);
        const x = pad + index * (barWidth + barGap);
        const y = height - pad - h;
        return (
          <g key={day.date}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(h, day.count > 0 ? 4 : 0)}
              rx={4}
              fill="#008060"
              opacity={day.count > 0 ? 1 : 0.2}
            />
            <text
              x={x + barWidth / 2}
              y={height - 6}
              textAnchor="middle"
              fontSize="10"
              fill="#6d7175"
            >
              {day.label}
            </text>
            {day.count > 0 && (
              <text
                x={x + barWidth / 2}
                y={y - 4}
                textAnchor="middle"
                fontSize="10"
                fill="#202223"
              >
                {day.count}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function FunnelBars({
  stats,
}: {
  stats: {
    pending: number;
    captured: number;
    contacted: number;
    qualified: number;
  };
}) {
  const rows = [
    { label: "Captured", value: stats.captured, color: "#008060" },
    { label: "Pending", value: stats.pending, color: "#b98900" },
    { label: "Contacted", value: stats.contacted, color: "#2c6ecb" },
    { label: "Qualified", value: stats.qualified, color: "#5c6ac4" },
  ];
  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {rows.map((row) => (
        <div key={row.label}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 13,
              marginBottom: 4,
            }}
          >
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
          <div
            style={{
              height: 10,
              background: "#e4e5e7",
              borderRadius: 999,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${(row.value / max) * 100}%`,
                height: "100%",
                background: row.color,
                borderRadius: 999,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ShopperAssistantPage() {
  const {
    shop,
    settings,
    messageCount,
    recentMessages,
    catalogCount,
    catalogError,
    shopName,
    leadStats,
    leadTrend,
    leads,
  } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const saving = fetcher.state !== "idle";
  const updatingLeadId =
    fetcher.state !== "idle" && fetcher.formData?.get("intent") === "lead-status"
      ? String(fetcher.formData.get("leadId") ?? "")
      : "";

  const shownCatalogCount =
    fetcher.data &&
    "catalogCount" in fetcher.data &&
    typeof fetcher.data.catalogCount === "number"
      ? fetcher.data.catalogCount
      : catalogCount;

  return (
    <s-page heading="Shopper Assistant">
      <s-link slot="breadcrumb-actions" href="/app">
        Dashboard
      </s-link>
      <s-button
        slot="secondary-actions"
        onClick={() =>
          fetcher.submit({ intent: "refresh-catalog" }, { method: "POST" })
        }
        {...(fetcher.state !== "idle" &&
        fetcher.formData?.get("intent") === "refresh-catalog"
          ? { loading: true }
          : {})}
      >
        Refresh catalog
      </s-button>

      <s-section>
        <s-stack direction="inline" gap="base">
          <s-link href="/app/ai">AI hub</s-link>
          <s-link href="/app/chat">Merchant chat</s-link>
          <s-text type="strong">Shopper settings</s-text>
          <s-link href="/app/assistant/analytics">Analytics</s-link>
        </s-stack>
      </s-section>

      <s-banner heading="Lead capture enabled" tone="info">
        Shoppers must enter name + email before chatting. Leads are saved and
        shown in the CRM funnel below.
      </s-banner>

      {catalogError && (
        <s-banner heading="Catalog load issue" tone="warning">
          {catalogError}. Use Refresh catalog after fixing API access.
        </s-banner>
      )}

      {fetcher.data && "error" in fetcher.data && fetcher.data.error && (
        <s-banner heading="Action failed" tone="critical">
          {String(fetcher.data.error)}
        </s-banner>
      )}

      <s-section heading="Lead analytics">
        <s-grid gridTemplateColumns="1fr 1fr 1fr 1fr 1fr" gap="base">
          <s-box padding="base" border="base" borderRadius="base">
            <s-heading>{leadStats.total}</s-heading>
            <s-paragraph>Total leads</s-paragraph>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-heading>{leadStats.last7d}</s-heading>
            <s-paragraph>New (7 days)</s-paragraph>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-heading>{leadStats.captured}</s-heading>
            <s-paragraph>Captured</s-paragraph>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-heading>{leadStats.pending}</s-heading>
            <s-paragraph>Pending</s-paragraph>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-heading>{leadStats.contacted + leadStats.qualified}</s-heading>
            <s-paragraph>Contacted / qualified</s-paragraph>
          </s-box>
        </s-grid>
      </s-section>

      <s-section heading="Lead charts">
        <s-grid gridTemplateColumns="1.2fr 1fr" gap="base">
          <s-box padding="base" border="base" borderRadius="base">
            <s-text type="strong">Captures · last 7 days</s-text>
            <div style={{ marginTop: 12 }}>
              <LeadTrendChart trend={leadTrend} />
            </div>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text type="strong">Pipeline funnel</s-text>
            <div style={{ marginTop: 12 }}>
              <FunnelBars stats={leadStats} />
            </div>
          </s-box>
        </s-grid>
      </s-section>

      <s-section heading="Captured leads">
        {leads.length === 0 ? (
          <s-paragraph>
            No leads yet. When a shopper opens the widget and submits name +
            email, they appear here.
          </s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            {leads.map((lead) => (
              <s-box
                key={lead.id}
                padding="base"
                border="base"
                borderRadius="base"
                background="subdued"
              >
                <s-stack direction="inline" gap="base">
                  <s-text type="strong">{lead.name}</s-text>
                  <s-text>{lead.email}</s-text>
                  <s-badge>{lead.status}</s-badge>
                  <s-text tone="neutral">
                    {new Date(lead.createdAt).toLocaleString()}
                  </s-text>
                </s-stack>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  Status
                  <select
                    value={lead.status}
                    disabled={updatingLeadId === lead.id}
                    onChange={(event) =>
                      fetcher.submit(
                        {
                          intent: "lead-status",
                          leadId: lead.id,
                          status: event.target.value,
                        },
                        { method: "POST" },
                      )
                    }
                    style={{
                      padding: "6px 10px",
                      borderRadius: 8,
                      border: "1px solid #c9cccf",
                    }}
                  >
                    <option value="captured">captured</option>
                    <option value="pending">pending</option>
                    <option value="contacted">contacted</option>
                    <option value="qualified">qualified</option>
                  </select>
                </label>
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>

      <s-section heading="Connection status">
        <s-grid gridTemplateColumns="1fr 1fr 1fr 1fr" gap="base">
          <s-box padding="base" border="base" borderRadius="base">
            <s-text type="strong">Shopify store</s-text>
            <s-badge tone="success">Connected</s-badge>
            <s-paragraph>{shopName}</s-paragraph>
            <s-paragraph>{shop}</s-paragraph>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text type="strong">Live catalog</s-text>
            <s-heading>{shownCatalogCount}</s-heading>
            <s-paragraph>Active products loaded</s-paragraph>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text type="strong">Buyer assistant</s-text>
            <s-badge tone={settings.buyerEnabled ? "success" : "warning"}>
              {settings.buyerEnabled ? "Enabled" : "Disabled"}
            </s-badge>
            <s-paragraph>Storefront recommendations</s-paragraph>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text type="strong">Conversations</s-text>
            <s-heading>{messageCount}</s-heading>
            <s-paragraph>Buyer messages logged</s-paragraph>
          </s-box>
        </s-grid>
      </s-section>

      <s-section heading="Widget settings">
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="save" />
          <s-stack direction="block" gap="base">
            <label>
              <input
                type="checkbox"
                name="buyerEnabled"
                defaultChecked={settings.buyerEnabled}
              />{" "}
              Enable shopper assistant on storefront
            </label>

            <label>
              <s-text type="strong">Welcome message</s-text>
              <textarea
                name="welcomeMessage"
                defaultValue={settings.welcomeMessage}
                rows={3}
                style={{
                  width: "100%",
                  marginTop: "8px",
                  padding: "10px",
                  borderRadius: "8px",
                  border: "1px solid #d2d5d8",
                }}
              />
            </label>

            <s-button
              type="submit"
              variant="primary"
              {...(saving && fetcher.formData?.get("intent") === "save"
                ? { loading: true }
                : {})}
            >
              Save settings
            </s-button>
          </s-stack>
        </fetcher.Form>
      </s-section>

      <s-section heading="Recent shopper conversations">
        {recentMessages.length === 0 ? (
          <s-paragraph>
            No buyer chats yet. Once the widget is enabled, conversations will
            appear here.
          </s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            {recentMessages.map((message) => (
              <s-box
                key={message.id}
                padding="base"
                border="base"
                borderRadius="base"
                background="subdued"
              >
                <s-stack direction="inline" gap="base">
                  <s-badge tone={message.role === "user" ? "info" : "success"}>
                    {message.role}
                  </s-badge>
                  <s-text tone="neutral">
                    {new Date(message.createdAt).toLocaleString()}
                  </s-text>
                </s-stack>
                <s-paragraph>{message.text}</s-paragraph>
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>

      <s-section slot="aside" heading="Enable on storefront">
        <s-unordered-list>
          <s-list-item>Online Store → Themes → Customize</s-list-item>
          <s-list-item>App embeds → BundleGuard Shopper Assistant</s-list-item>
          <s-list-item>Turn on and save</s-list-item>
          <s-list-item>Shoppers enter name + email before chat</s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
