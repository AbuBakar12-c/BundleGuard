import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getAssistantSettings } from "../services/chat.server";
import {
  getPlanContext,
  requireFeature,
} from "../services/plan-access.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const { features } = await getPlanContext(billing);
  requireFeature(features, "merchantAi");
  const settings = await getAssistantSettings(session.shop);
  return {
    settings,
    sampleAnswer:
      "Welcome to BundleGuard Assistant. I can help with blocked bundles, low stock, component shortages, and location audit gaps.",
  };
};

export default function AssistantSettingsPage() {
  const { settings, sampleAnswer } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Assistant settings">
      <s-link slot="breadcrumb-actions" href="/app/ai">
        Back to AI
      </s-link>
      <s-section>
        <s-stack direction="inline" gap="base">
          <s-link href="/app/ai">AI hub</s-link>
          <s-link href="/app/chat">Merchant chat</s-link>
          <s-link href="/app/assistant/conversations">Conversations</s-link>
          <s-link href="/app/assistant/analytics">Analytics</s-link>
          <s-text type="strong">Settings</s-text>
        </s-stack>
      </s-section>

      <s-section heading="Connection status">
        <s-grid gridTemplateColumns="1fr 1fr 1fr" gap="base">
          <s-box padding="base" border="base" borderRadius="base">
            <s-stack direction="block" gap="base">
              <s-text type="strong">Shopify app</s-text>
              <s-badge tone="success">Connected</s-badge>
              <s-paragraph>{settings.connectedShop}</s-paragraph>
            </s-stack>
          </s-box>

          <s-box padding="base" border="base" borderRadius="base">
            <s-stack direction="block" gap="base">
              <s-text type="strong">OpenAI integration</s-text>
              <s-badge tone={settings.openAiConfigured ? "success" : "critical"}>
                {settings.openAiConfigured ? "Configured" : "Missing API key"}
              </s-badge>
              <s-paragraph>
                {settings.openAiConfigured
                  ? "AI responses are enabled."
                  : "Set OPENAI_API_KEY in .env to enable AI responses."}
              </s-paragraph>
            </s-stack>
          </s-box>

          <s-box padding="base" border="base" borderRadius="base">
            <s-stack direction="block" gap="base">
              <s-text type="strong">Assistant activity</s-text>
              <s-badge tone="info">
                {settings.lastActiveAt ? "Active" : "No chats yet"}
              </s-badge>
              <s-paragraph>
                {settings.lastActiveAt
                  ? `Last message: ${new Date(settings.lastActiveAt).toLocaleString()}`
                  : "Start a chat to activate conversation history."}
              </s-paragraph>
            </s-stack>
          </s-box>
        </s-grid>
      </s-section>

      <s-section heading="BundleGuard data access">
        <s-stack direction="inline" gap="base">
          <s-box padding="base" border="base" borderRadius="base">
            <s-text type="strong">{settings.bundleCount}</s-text>
            <s-paragraph>Tracked bundles</s-paragraph>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text type="strong">{settings.alertCount}</s-text>
            <s-paragraph>Unread inventory alerts</s-paragraph>
          </s-box>
        </s-stack>
      </s-section>

      <s-section heading="Welcome message preview">
        <s-box padding="base" border="base" borderRadius="base" background="subdued">
          <s-paragraph>{sampleAnswer}</s-paragraph>
        </s-box>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
