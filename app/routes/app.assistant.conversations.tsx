import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getRecentAssistantConversations } from "../services/chat.server";
import {
  getPlanContext,
  requireFeature,
} from "../services/plan-access.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const { features } = await getPlanContext(billing);
  requireFeature(features, "merchantAi");
  const messages = await getRecentAssistantConversations(session.shop);
  return { messages };
};

export default function AssistantConversationsPage() {
  const { messages } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Assistant conversations">
      <s-link slot="breadcrumb-actions" href="/app/ai">
        Back to AI
      </s-link>

      <s-section>
        <s-stack direction="inline" gap="base">
          <s-link href="/app/ai">AI hub</s-link>
          <s-link href="/app/chat">Merchant chat</s-link>
          <s-text type="strong">Conversations</s-text>
          <s-link href="/app/assistant/analytics">Analytics</s-link>
          <s-link href="/app/assistant/settings">Settings</s-link>
        </s-stack>
      </s-section>

      <s-section heading="Recent messages">
        {messages.length === 0 ? (
          <s-paragraph>No conversation history yet. Start from Assistant chat.</s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            {messages.map((message) => (
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
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
