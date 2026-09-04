import OpenAI from "openai";
import prisma from "../db.server";
import {
  MERCHANT_ASSISTANT_SYSTEM,
  detectMerchantIntent,
  sanitizeUserText,
} from "./assistant-prompts.server";

const MAX_HISTORY = 16;
const MODEL = "gpt-4o-mini";

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set in .env");
  return new OpenAI({ apiKey });
}

async function buildStoreContext(shop: string, intent: string) {
  const bundles = await prisma.bundle.findMany({
    where: { shop },
    include: { components: true },
    orderBy: { updatedAt: "desc" },
    take: 40,
  });

  const alerts = await prisma.inventoryAlert.findMany({
    where: { shop, readAt: null },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const summary = {
    total: bundles.length,
    healthy: bundles.filter((b) => b.status === "healthy").length,
    warning: bundles.filter((b) => b.status === "warning").length,
    blocked: bundles.filter((b) => b.status === "blocked").length,
    totalKits: bundles.reduce((s, b) => s + b.availableQuantity, 0),
  };

  const prioritized =
    intent === "blocked" || intent === "summary"
      ? [
          ...bundles.filter((b) => b.status === "blocked"),
          ...bundles.filter((b) => b.status === "warning"),
          ...bundles.filter((b) => b.status === "healthy"),
        ]
      : bundles;

  const bundleData = prioritized.slice(0, 25).map((b) => ({
    title: b.title,
    status: b.status,
    kits: b.availableQuantity,
    blockReason: b.blockReason,
    oosRule: b.oosRule,
    lastSynced: b.lastSyncedAt?.toISOString() ?? "never",
    shortComponents: b.components
      .filter(
        (c) =>
          c.inventoryPolicy !== "CONTINUE" && c.availableQty < c.quantity,
      )
      .map((c) => ({
        sku: c.sku ?? "no-sku",
        product: c.productTitle,
        need: c.quantity,
        have: c.availableQty,
      })),
    components: b.components.map((c) => ({
      product: c.productTitle,
      variant: c.variantTitle,
      sku: c.sku ?? "none",
      required: c.quantity,
      available: c.availableQty,
      policy: c.inventoryPolicy,
    })),
  }));

  const alertData = alerts.map((a) => ({
    severity: a.severity,
    kind: a.kind,
    message: a.message,
    location: a.locationName,
    sku: a.sku,
  }));

  return {
    shop,
    intent,
    generatedAt: new Date().toISOString(),
    summary,
    bundles: bundleData,
    alerts: alertData,
  };
}

export async function getChatHistory(shop: string) {
  return prisma.chatMessage.findMany({
    where: { shop },
    orderBy: { createdAt: "asc" },
    take: MAX_HISTORY * 2,
  });
}

export async function clearChatHistory(shop: string) {
  await prisma.chatMessage.deleteMany({ where: { shop } });
}

export async function getAssistantSettings(shop: string) {
  const [bundleCount, alertCount, latestMessage] = await Promise.all([
    prisma.bundle.count({ where: { shop } }),
    prisma.inventoryAlert.count({ where: { shop, readAt: null } }),
    prisma.chatMessage.findFirst({
      where: { shop },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return {
    connectedShop: shop,
    openAiConfigured: Boolean(process.env.OPENAI_API_KEY),
    bundleCount,
    alertCount,
    lastActiveAt: latestMessage?.createdAt ?? null,
  };
}

function bucketTopic(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes("blocked") || lower.includes("oos")) return "Blocked bundles";
  if (lower.includes("stock") || lower.includes("restock")) return "Stock health";
  if (lower.includes("location") || lower.includes("warehouse")) return "Location audit";
  if (lower.includes("sku") || lower.includes("component")) return "Component lookup";
  return "General summary";
}

export async function getAssistantAnalytics(shop: string) {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [messages7d, messages30d, latestMessages] = await Promise.all([
    prisma.chatMessage.findMany({
      where: { shop, createdAt: { gte: sevenDaysAgo } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.chatMessage.findMany({
      where: { shop, createdAt: { gte: thirtyDaysAgo } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.chatMessage.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  const user7d = messages7d.filter((m) => m.role === "user");
  const assistant7d = messages7d.filter((m) => m.role === "assistant");
  const avgReplyLength =
    assistant7d.length > 0
      ? Math.round(
          assistant7d.reduce((sum, m) => sum + m.text.length, 0) /
            assistant7d.length,
        )
      : 0;

  const topics = new Map<string, number>();
  for (const message of latestMessages.filter((m) => m.role === "user")) {
    const key = bucketTopic(message.text);
    topics.set(key, (topics.get(key) ?? 0) + 1);
  }

  const topTopics = [...topics.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([topic, count]) => ({ topic, count }));

  const daily = new Map<string, number>();
  for (const message of user7d) {
    const dayKey = message.createdAt.toISOString().slice(0, 10);
    daily.set(dayKey, (daily.get(dayKey) ?? 0) + 1);
  }

  return {
    totalMessages30d: messages30d.length,
    userQuestions7d: user7d.length,
    assistantReplies7d: assistant7d.length,
    avgReplyLength,
    topTopics,
    dailyQuestions: [...daily.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({ date, count })),
  };
}

export async function getRecentAssistantConversations(shop: string) {
  return prisma.chatMessage.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

function deterministicFallback(
  intent: string,
  context: Awaited<ReturnType<typeof buildStoreContext>>,
) {
  const { summary, bundles, alerts } = context;

  if (summary.total === 0) {
    return "You have no bundles tracked yet.\n\n**Next step:** open Dashboard → Create bundle to start monitoring inventory.";
  }

  if (intent === "blocked") {
    const blocked = bundles.filter((b) => b.status === "blocked");
    if (blocked.length === 0) {
      return "**Verdict:** No blocked bundles right now.\n\nAll tracked kits currently have enough component stock.";
    }
    const lines = [
      `**Verdict:** ${blocked.length} bundle${blocked.length > 1 ? "s are" : " is"} blocked.`,
      "",
      ...blocked.slice(0, 5).map((b) => {
        const short =
          b.shortComponents
            ?.map((c) => `${c.sku} (need ${c.need}, have ${c.have})`)
            .join(", ") || b.blockReason;
        return `• **${b.title}** — ${short}`;
      }),
      "",
      "**Next step:** open Location Audit for warehouse gaps, then restock the short SKUs.",
    ];
    return lines.join("\n");
  }

  if (intent === "alerts") {
    if (alerts.length === 0) {
      return "**Verdict:** No active inventory alerts.\n\nYour location and fulfillment checks look clean.";
    }
    return [
      `**Verdict:** ${alerts.length} active alert${alerts.length > 1 ? "s" : ""}.`,
      "",
      ...alerts.slice(0, 5).map((a) => `• ${a.message}`),
      "",
      "**Next step:** open Location Audit to resolve blocked fulfillment gaps.",
    ].join("\n");
  }

  return [
    "**Bundle inventory summary**",
    `• ${summary.total} bundles · ${summary.totalKits} sellable kits`,
    `• ${summary.healthy} healthy · ${summary.warning} warning · ${summary.blocked} blocked`,
    alerts.length > 0 ? `• ${alerts.length} active location alerts` : "• No active location alerts",
    "",
    "**Next step:** ask \"which bundles are blocked?\" or open the Dashboard.",
  ].join("\n");
}

export async function answerQuestion(
  shop: string,
  question: string,
): Promise<string> {
  const cleaned = sanitizeUserText(question);
  if (!cleaned) {
    return "Please ask a question about your bundle inventory (for example: which bundles are blocked?).";
  }

  await prisma.chatMessage.create({
    data: { shop, role: "user", text: cleaned },
  });

  const intent = detectMerchantIntent(cleaned);
  const storeContext = await buildStoreContext(shop, intent);

  const history = await prisma.chatMessage.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take: MAX_HISTORY,
  });
  history.reverse();

  try {
    const client = getClient();
    const completion = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.25,
      max_tokens: 550,
      messages: [
        { role: "system", content: MERCHANT_ASSISTANT_SYSTEM },
        {
          role: "system",
          content: `STORE CONTEXT (authoritative, real-time):\n${JSON.stringify(storeContext)}`,
        },
        ...history.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.text,
        })),
      ],
    });

    const answer =
      completion.choices[0]?.message?.content?.trim() ||
      deterministicFallback(intent, storeContext);

    await prisma.chatMessage.create({
      data: { shop, role: "assistant", text: answer },
    });

    return answer;
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";

    if (msg.includes("API key") || msg.includes("OPENAI_API_KEY")) {
      const fallback = deterministicFallback(intent, storeContext);
      await prisma.chatMessage.create({
        data: { shop, role: "assistant", text: fallback },
      });
      return `${fallback}\n\n_Note: Add OPENAI_API_KEY for full AI conversation quality._`;
    }

    const fallback = deterministicFallback(intent, storeContext);
    await prisma.chatMessage.create({
      data: { shop, role: "assistant", text: fallback },
    });
    return fallback;
  }
}
