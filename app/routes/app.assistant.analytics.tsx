import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getAssistantAnalytics } from "../services/chat.server";
import {
  getPlanContext,
  requireFeature,
} from "../services/plan-access.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const { features } = await getPlanContext(billing);
  requireFeature(features, "merchantAi");
  const analytics = await getAssistantAnalytics(session.shop);
  return { analytics };
};

export default function AssistantAnalyticsPage() {
  const { analytics } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Assistant analytics">
      <s-link slot="breadcrumb-actions" href="/app/ai">
        Back to AI
      </s-link>

      <s-section>
        <s-stack direction="inline" gap="base">
          <s-link href="/app/ai">AI hub</s-link>
          <s-link href="/app/chat">Merchant chat</s-link>
          <s-link href="/app/assistant/conversations">Conversations</s-link>
          <s-text type="strong">Analytics</s-text>
          <s-link href="/app/assistant/settings">Settings</s-link>
        </s-stack>
      </s-section>

      <s-section heading="Performance overview">
        <s-grid gridTemplateColumns="1fr 1fr 1fr 1fr" gap="base">
          <s-box padding="base" border="base" borderRadius="base">
            <s-text type="strong">{analytics.totalMessages30d}</s-text>
            <s-paragraph>Total messages (30d)</s-paragraph>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text type="strong">{analytics.userQuestions7d}</s-text>
            <s-paragraph>User questions (7d)</s-paragraph>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text type="strong">{analytics.assistantReplies7d}</s-text>
            <s-paragraph>Assistant replies (7d)</s-paragraph>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text type="strong">{analytics.avgReplyLength}</s-text>
            <s-paragraph>Avg reply length (chars)</s-paragraph>
          </s-box>
        </s-grid>
      </s-section>

      <s-section heading="Top question topics">
        {analytics.topTopics.length === 0 ? (
          <s-paragraph>No chat data yet.</s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Topic</s-table-header>
              <s-table-header>Questions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {analytics.topTopics.map((item) => (
                <s-table-row key={item.topic}>
                  <s-table-cell>{item.topic}</s-table-cell>
                  <s-table-cell>{item.count}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-section heading="Daily questions (last 7 days)">
        {analytics.dailyQuestions.length === 0 ? (
          <s-paragraph>No questions in the last 7 days.</s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            {analytics.dailyQuestions.map((row) => (
              <s-box key={row.date} padding="base" border="base" borderRadius="base">
                <s-stack direction="inline" gap="base">
                  <s-text type="strong">{row.date}</s-text>
                  <s-badge tone="info">{row.count} questions</s-badge>
                </s-stack>
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
