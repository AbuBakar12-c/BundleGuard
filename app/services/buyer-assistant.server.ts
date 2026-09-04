/**
 * Production Shopper AI — accuracy-first answers from full store catalog.
 */

import OpenAI from "openai";
import prisma from "../db.server";
import {
  detectBuyerIntent,
  extractBudgetMax,
  isVagueBuyerQuery,
  sanitizeUserText,
} from "./assistant-prompts.server";
import {
  buildStoreCatalogInsights,
  fetchFullStoreCatalog,
  matchProductsFromCatalog,
  toAiProductContext,
  type AdminGraphql,
  type CatalogProduct,
  type StoreCatalogInsights,
} from "./catalog.server";
import {
  buildBudgetQuizCard,
  buildCategoryQuizCard,
  resolveRecommendQuizPicks,
  type RecommendQuizCard,
} from "./recommend-quiz.server";

export type { RecommendQuizCard };

const MODEL = "gpt-4o-mini";
const MAX_HISTORY = 10;

export interface ProductRecommendation {
  id: string;
  title: string;
  handle: string;
  url: string;
  imageUrl: string | null;
  price: string;
  available: boolean;
  reason: string;
}

function getOpenAiClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

function toRecommendation(
  product: CatalogProduct,
  reason: string,
): ProductRecommendation {
  return {
    id: product.id,
    title: product.title,
    handle: product.handle,
    url: product.url,
    imageUrl: product.imageUrl,
    price: product.minPrice,
    available: product.available,
    reason,
  };
}

function cleanShopperText(text: string) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[—–]/g, "-")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildShopperSystemPrompt(shopName: string, productCount: number) {
  return `You are the official shopping assistant for "${shopName}" on Shopify.

ROLE
- Talk like a skilled, friendly retail associate: warm, clear, professional.
- Help shoppers discover products using ONLY the live store catalog provided.

ACCURACY RULES (NON-NEGOTIABLE)
1) Use ONLY products in CATALOG_MATCHES / CATALOG_SUMMARY. Never invent products, prices, stock, or SKUs.
2) If CATALOG_MATCHES has items, mention real product titles and prices from that list.
3) Never say "I don't know your products" when catalog data is present.
4) If a requested product is not in the catalog, say it is not available and suggest the closest real alternatives.
5) Prefer in-stock items. If recommending out-of-stock, clearly say limited/unavailable.
6) Do not invent shipping times, discounts, return policy, or warranty unless included in the data.
7) This store currently has ${productCount} active products in the loaded catalog.

WRITING STYLE (CRITICAL)
- Clean plain text only. Never use markdown: no **, *, __, backticks, or # headings.
- No bullet symbols like • or weird special characters. Use simple numbers (1. 2. 3.) if listing.
- Use 1-2 positive emojis max when helpful (e.g. ✨ 😊 👍 🛍️) - never spam.
- Short natural sentences. Sound human and professional.
- Keep replies about 60-120 words unless the shopper asks for more detail.
- Say product names plainly with price, e.g. The Snow Jacket - $89 (in stock).

STORE-AWARE QUESTIONS
- BEFORE asking what the shopper wants, check CATALOG_SUMMARY categories/collections.
- NEVER invent categories (e.g. phone protection, travel, outdoor) unless they appear in CATALOG_SUMMARY.
- For vague asks ("best product"): briefly say what this store sells, then point them to the category choices or product cards.
- If the catalog is empty, say so honestly.

RESPONSE SHAPE
- Friendly opening line.
- 1-3 concrete product suggestions with title + price + stock.
- One short closing invite (Want a different category? or Prefer a lower budget?).`;
}

function formatStoreCategoryLine(insights: StoreCatalogInsights) {
  const labels =
    insights.collections.length > 0
      ? insights.collections.map((c) => c.name)
      : insights.categories.map((c) => c.name);
  if (labels.length === 0) return "";
  return `We currently sell: ${labels.slice(0, 5).join(", ")}.`;
}

function deterministicAnswer(
  intent: string,
  shopName: string,
  picks: CatalogProduct[],
  totalCount: number,
  insights?: StoreCatalogInsights,
) {
  if (totalCount === 0) {
    return cleanShopperText(
      `I checked ${shopName}'s catalog, and there are no active products published yet. Once products are set to Active in Shopify Admin, I can recommend them here. 😊`,
    );
  }

  const categoryLine = insights ? formatStoreCategoryLine(insights) : "";

  if (intent === "greeting") {
    return cleanShopperText(
      [
        `Welcome to ${shopName}! ✨ I found ${totalCount} active product${totalCount === 1 ? "" : "s"} in our catalog.`,
        categoryLine,
        "Tell me what you need, or tap a suggestion below.",
      ]
        .filter(Boolean)
        .join("\n\n"),
    );
  }

  if (picks.length === 0) {
    return cleanShopperText(
      [
        `I searched our catalog (${totalCount} products) but couldn't find a close match.`,
        categoryLine,
        'Try a category from our store or a budget, for example: "products under $50".',
      ]
        .filter(Boolean)
        .join("\n\n"),
    );
  }

  const intro =
    intent === "catalog" || intent === "bestsellers"
      ? [
          `Great news! ✨ I checked ${shopName}'s live catalog (${totalCount} products).`,
          categoryLine,
          "Here are the best matches right now:",
        ]
          .filter(Boolean)
          .join("\n\n")
      : "Based on our live catalog, here are the best matches: 🛍️";

  const lines = [
    intro,
    "",
    ...picks.slice(0, 3).map((p, i) => {
      const price =
        p.minPrice === p.maxPrice
          ? `$${p.minPrice}`
          : `$${p.minPrice}-$${p.maxPrice}`;
      const stock = p.available ? "In stock" : "Limited stock";
      return `${i + 1}. ${p.title} - ${price} (${stock})`;
    }),
    "",
    "Tap a product card below for details, or tell me a style or budget to narrow it down. 😊",
  ];
  return cleanShopperText(lines.join("\n"));
}

export async function getShopperSettings(shop: string) {
  return prisma.shopAssistantSettings.upsert({
    where: { shop },
    update: {},
    create: { shop },
  });
}

export async function updateShopperSettings(
  shop: string,
  data: { buyerEnabled?: boolean; welcomeMessage?: string },
) {
  return prisma.shopAssistantSettings.upsert({
    where: { shop },
    update: data,
    create: { shop, ...data },
  });
}

export async function getRecentBuyerMessages(shop: string, sessionId?: string) {
  return prisma.buyerChatMessage.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take: sessionId ? MAX_HISTORY : 50,
  });
}

async function saveBuyerMessage(
  shop: string,
  role: "user" | "assistant",
  text: string,
  leadId?: string | null,
) {
  await prisma.buyerChatMessage.create({
    data: {
      shop,
      role,
      text: text.slice(0, 4000),
      leadId: leadId || null,
    },
  });
}

async function describeProductImage(imageDataUrl: string) {
  const client = getOpenAiClient();
  if (!client) return "";

  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.1,
      max_tokens: 60,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract product search keywords only: type, color, material, style, category. Max 12 words. No sentences.",
            },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
    });
    return completion.choices[0]?.message?.content?.trim() || "";
  } catch {
    return "";
  }
}

export async function answerBuyerQuestion(options: {
  shop: string;
  admin: AdminGraphql;
  question: string;
  imageDataUrl?: string | null;
  leadId?: string | null;
  quizStep?: "category" | "budget" | "results" | null;
  selectedCategory?: string | null;
  selectedBudget?: string | null;
}) {
  const { shop, admin, imageDataUrl, leadId } = options;
  const question = sanitizeUserText(options.question);
  const settings = await getShopperSettings(shop);

  if (!settings.buyerEnabled) {
    return {
      answer:
        "Our shopping assistant is currently unavailable. Please browse the catalog or contact the store.",
      recommendations: [] as ProductRecommendation[],
      quiz: null as RecommendQuizCard | null,
    };
  }

  const userLog = imageDataUrl
    ? `[Image] ${question || "Find this product"}`
    : question;
  await saveBuyerMessage(shop, "user", userLog, leadId);

  const vagueQuery = isVagueBuyerQuery(question);
  const intent = detectBuyerIntent(question || "catalog");
  const budgetMax = extractBudgetMax(question);
  const quizStep = options.quizStep ?? null;
  const selectedCategory = options.selectedCategory ?? null;
  const selectedBudget = options.selectedBudget ?? null;

  let searchText = question;
  if (imageDataUrl) {
    const visionKeywords = await describeProductImage(imageDataUrl);
    searchText = [visionKeywords, question].filter(Boolean).join(" ");
  }

  // 1) Load FULL active catalog (paginated, cached briefly)
  let catalog;
  try {
    catalog = await fetchFullStoreCatalog(admin, shop);
  } catch (error) {
    console.error("[buyer-assistant] full catalog failed", error);
    const answer =
      "I couldn't load the store catalog right now. Please try again in a moment.";
    await saveBuyerMessage(shop, "assistant", answer, leadId);
    return {
      answer,
      recommendations: [] as ProductRecommendation[],
      quiz: null as RecommendQuizCard | null,
    };
  }

  const insights = buildStoreCatalogInsights(catalog);

  // Zipchat-style guided recommend flow — categories/prices from LIVE catalog only
  const startQuiz =
    quizStep === "category" ||
    (vagueQuery && !imageDataUrl && !quizStep && !selectedCategory);

  if (startQuiz) {
    if (catalog.productCount === 0) {
      const answer = deterministicAnswer(
        "catalog",
        catalog.shopName,
        [],
        0,
        insights,
      );
      await saveBuyerMessage(shop, "assistant", answer, leadId);
      return {
        answer,
        recommendations: [] as ProductRecommendation[],
        quiz: null,
        suggestions: insights.suggestions,
      };
    }

    const quiz = buildCategoryQuizCard(catalog);
    const answer = cleanShopperText(
      `Happy to help you find the best fit! ✨ I checked our live catalog first. Please choose a category we actually sell:`,
    );
    await saveBuyerMessage(shop, "assistant", answer, leadId);
    return {
      answer,
      recommendations: [] as ProductRecommendation[],
      quiz,
      suggestions: insights.suggestions,
    };
  }

  if (quizStep === "budget" && selectedCategory) {
    const quiz = buildBudgetQuizCard(catalog, selectedCategory);
    const answer = cleanShopperText(
      selectedCategory === "__other__" || selectedCategory === "__all__"
        ? "Perfect! 👍 What's your budget? These ranges match products currently in our store."
        : `Nice choice! Looking in ${selectedCategory}. What's your budget? Ranges are based on real prices in that category. 😊`,
    );
    await saveBuyerMessage(shop, "assistant", answer, leadId);
    return {
      answer,
      recommendations: [] as ProductRecommendation[],
      quiz,
      suggestions: insights.suggestions,
    };
  }

  if (quizStep === "results" || (selectedCategory && selectedBudget)) {
    const picks = resolveRecommendQuizPicks(
      catalog,
      selectedCategory,
      selectedBudget,
      3,
    );
    const recommendations = picks.map((p) =>
      toRecommendation(
        p,
        selectedCategory &&
          selectedCategory !== "__all__" &&
          selectedCategory !== "__other__"
          ? `From ${selectedCategory}`
          : "Store match",
      ),
    );
    const answer = cleanShopperText(
      picks.length > 0
        ? `Here are my top picks for you based on what we sell and your budget: 🛍️`
        : `I couldn't find products in that category and budget combo. Please try another category from our real catalog. 😊`,
    );
    await saveBuyerMessage(shop, "assistant", answer, leadId);
    return {
      answer,
      recommendations,
      quiz: null,
      suggestions: insights.suggestions,
    };
  }

  if (intent === "greeting" && !searchText.trim()) {
    const answer = deterministicAnswer(
      "greeting",
      catalog.shopName,
      [],
      catalog.productCount,
      insights,
    );
    await saveBuyerMessage(shop, "assistant", answer, leadId);
    return {
      answer,
      recommendations: [] as ProductRecommendation[],
      quiz: null,
      suggestions: insights.suggestions,
    };
  }

  // 2) Match against complete catalog (no missing products from truncated search)
  const matched =
    vagueQuery ||
    intent === "catalog" ||
    intent === "bestsellers" ||
    intent === "in_stock"
      ? matchProductsFromCatalog(catalog, "", {
          budgetMax,
          limit: 8,
        })
      : matchProductsFromCatalog(catalog, searchText || question, {
          budgetMax,
          limit: 8,
        });

  // If keyword match empty, still show top available catalog items for browse-like asks
  const picks =
    matched.length > 0
      ? matched
      : matchProductsFromCatalog(catalog, "", { limit: 6 });

  const recommendations = picks.slice(0, 3).map((p) =>
    toRecommendation(
      p,
      p.available ? "Live catalog match" : "From catalog (limited stock)",
    ),
  );

  const history = await prisma.buyerChatMessage.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take: MAX_HISTORY,
  });
  history.reverse();

  const productContext = toAiProductContext(picks.slice(0, 8));
  const summaryContext = {
    shop: catalog.shopName,
    totalActiveProducts: catalog.productCount,
    fetchedAt: catalog.fetchedAt,
    categories: insights.categories,
    collections: insights.collections,
    priceRange: insights.priceRange,
    productTypes: insights.categories.map((c) => c.name),
    vendors: [
      ...new Set(catalog.products.map((p) => p.vendor).filter(Boolean)),
    ].slice(0, 20),
  };

  let answer = deterministicAnswer(
    vagueQuery && intent === "search" ? "catalog" : intent,
    catalog.shopName,
    picks,
    catalog.productCount,
    insights,
  );

  const client = getOpenAiClient();
  if (client && !vagueQuery) {
    try {
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: "system",
          content: buildShopperSystemPrompt(
            catalog.shopName,
            catalog.productCount,
          ),
        },
        {
          role: "system",
          content: `CATALOG_SUMMARY:\n${JSON.stringify(summaryContext)}\n\nCATALOG_MATCHES:\n${JSON.stringify(productContext)}`,
        },
      ];

      // recent conversation for human-like continuity (skip current user already appended)
      for (const msg of history.slice(0, -1)) {
        messages.push({
          role: msg.role as "user" | "assistant",
          content: msg.text,
        });
      }

      if (imageDataUrl) {
        messages.push({
          role: "user",
          content: [
            {
              type: "text",
              text: `Shopper message: ${question || "Find products like this image"}\nIntent: ${intent}\nBudget max: ${budgetMax ?? "none"}`,
            },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        });
      } else {
        messages.push({
          role: "user",
          content: `Shopper message: ${question}\nIntent: ${intent}\nBudget max: ${budgetMax ?? "none"}`,
        });
      }

      const completion = await client.chat.completions.create({
        model: MODEL,
        temperature: 0.35,
        max_tokens: 380,
        messages,
      });

      answer = cleanShopperText(
        completion.choices[0]?.message?.content?.trim() || answer,
      );
    } catch (error) {
      console.error("[buyer-assistant] OpenAI failed", error);
    }
  }

  await saveBuyerMessage(shop, "assistant", cleanShopperText(answer), leadId);

  const inStock = recommendations.filter((r) => r.available);
  return {
    answer: cleanShopperText(answer),
    recommendations:
      inStock.length > 0 ? inStock.slice(0, 3) : recommendations.slice(0, 3),
    quiz: null as RecommendQuizCard | null,
    suggestions: insights.suggestions,
  };
}

export async function getShopperStoreInsights(
  admin: AdminGraphql,
  shop: string,
) {
  const catalog = await fetchFullStoreCatalog(admin, shop);
  return buildStoreCatalogInsights(catalog);
}
