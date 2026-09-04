import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  answerBuyerQuestion,
  getShopperSettings,
  getShopperStoreInsights,
} from "../services/buyer-assistant.server";
import {
  captureShopperLead,
  getLeadById,
} from "../services/leads.server";
import {
  assertFeatureOrThrow,
  resolveEntitlementsFromAdmin,
} from "../services/entitlements.server";
import {
  clientIpFromRequest,
  rateLimit,
} from "../services/rate-limit.server";
import {
  logAndPublicError,
  normalizeShopDomain,
  publicJson,
} from "../services/http.server";

const MAX_QUESTION_LEN = 800;
const MAX_CATEGORY_LEN = 120;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const context = await authenticate.public.appProxy(request);
    const url = new URL(request.url);
    const shop = normalizeShopDomain(
      url.searchParams.get("shop") ?? context.session?.shop,
    );

    if (!shop) {
      return publicJson({ enabled: false, welcomeMessage: "" }, { status: 400 });
    }

    const ip = clientIpFromRequest(request);
    const limited = rateLimit({
      key: `settings:${shop}:${ip}`,
      limit: 60,
      windowMs: 60_000,
    });
    if (!limited.ok) {
      return publicJson(
        { enabled: false, welcomeMessage: "", error: "rate_limited" },
        {
          status: 429,
          headers: { "Retry-After": String(limited.retryAfterSec) },
        },
      );
    }

    // Backend Pro gate — frontend cannot bypass this
    if (!context.admin) {
      return publicJson(
        {
          enabled: false,
          welcomeMessage: "",
          error: "not_connected",
          planRequired: true,
        },
        { status: 401 },
      );
    }

    const entitlements = await resolveEntitlementsFromAdmin(
      shop,
      context.admin,
    );
    if (!entitlements.features.shopperAi) {
      return publicJson(
        {
          enabled: false,
          welcomeMessage: "",
          error: "plan_required",
          planRequired: true,
          planName: entitlements.planName,
          message:
            "Shopper AI is available on the Pro plan. Upgrade in BundleGuard → Plan.",
        },
        { status: 402 },
      );
    }

    const settings = await getShopperSettings(shop);
    if (!settings.buyerEnabled) {
      return publicJson({
        enabled: false,
        welcomeMessage: "",
        planName: entitlements.planName,
      });
    }

    let storeInsights = null;
    try {
      storeInsights = await getShopperStoreInsights(context.admin, shop);
    } catch (error) {
      console.error("[apps.bundleguard.chat] store insights failed", error);
    }

    return publicJson({
      enabled: true,
      welcomeMessage: settings.welcomeMessage,
      requireLead: true,
      planName: entitlements.planName,
      productCount: storeInsights?.productCount ?? null,
      categories: storeInsights?.categories ?? [],
      collections: storeInsights?.collections ?? [],
      suggestions: storeInsights?.suggestions ?? [
        "Help me choose",
        "What's in stock?",
      ],
    });
  } catch (error) {
    if (error instanceof Response) throw error;
    return logAndPublicError(
      "apps.bundleguard.chat.loader",
      error,
      500,
      "Unable to load the shopping assistant right now.",
    );
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const context = await authenticate.public.appProxy(request);

    if (!context.admin || !context.session?.shop) {
      return publicJson(
        {
          error: "not_connected",
          answer:
            "I'm still connecting to this store. Please open BundleGuard in Shopify Admin once, then ask again.",
          recommendations: [],
        },
        { status: 401 },
      );
    }

    const shop = normalizeShopDomain(context.session.shop);
    if (!shop) {
      return publicJson(
        { error: "invalid_shop", answer: "Invalid shop.", recommendations: [] },
        { status: 400 },
      );
    }

    // Centralized Pro entitlement (not frontend-controlled)
    const entitlements = await resolveEntitlementsFromAdmin(
      shop,
      context.admin,
    );
    assertFeatureOrThrow(
      entitlements,
      "shopperAi",
      "Shopper AI requires the Pro plan. Please upgrade in BundleGuard → Plan.",
    );

    const ip = clientIpFromRequest(request);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return publicJson(
        { error: "invalid_body", answer: "Invalid request.", recommendations: [] },
        { status: 400 },
      );
    }

    const intent = String(
      (body as { intent?: unknown }).intent ?? "chat",
    ).trim();

    const limited = rateLimit(
      intent === "lead"
        ? { key: `lead:${shop}:${ip}`, limit: 8, windowMs: 60_000 }
        : { key: `chat:${shop}:${ip}`, limit: 20, windowMs: 60_000 },
    );
    if (!limited.ok) {
      return publicJson(
        {
          error: "rate_limited",
          answer:
            "You're sending messages too quickly. Please wait a few seconds.",
          recommendations: [],
        },
        {
          status: 429,
          headers: { "Retry-After": String(limited.retryAfterSec) },
        },
      );
    }

    const settings = await getShopperSettings(shop);
    if (!settings.buyerEnabled) {
      return publicJson(
        {
          ok: false,
          enabled: false,
          error: "disabled",
          answer:
            "Our shopping assistant is currently unavailable. Please browse the store or contact support.",
          recommendations: [],
        },
        { status: 403 },
      );
    }

    if (intent === "lead") {
      try {
        const lead = await captureShopperLead({
          shop,
          name: String((body as { name?: unknown }).name ?? ""),
          email: String((body as { email?: unknown }).email ?? ""),
          sessionKey: (body as { sessionKey?: unknown }).sessionKey
            ? String((body as { sessionKey?: unknown }).sessionKey)
            : null,
          source: "shopper_chat",
        });

        return publicJson({
          ok: true,
          leadId: lead.id,
          name: lead.name,
          email: lead.email,
          status: lead.status,
          message: `Thanks ${lead.name}! You're all set — ask me anything about our products.`,
        });
      } catch (error) {
        return publicJson(
          {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Could not save your details.",
          },
          { status: 400 },
        );
      }
    }

    const question = String((body as { question?: unknown }).question ?? "")
      .trim()
      .slice(0, MAX_QUESTION_LEN);
    const image = (body as { image?: unknown }).image
      ? String((body as { image?: unknown }).image)
      : null;
    const leadId = (body as { leadId?: unknown }).leadId
      ? String((body as { leadId?: unknown }).leadId)
      : null;
    const quizStepRaw = (body as { quizStep?: unknown }).quizStep
      ? String((body as { quizStep?: unknown }).quizStep)
      : null;
    const quizStep =
      quizStepRaw === "category" ||
      quizStepRaw === "budget" ||
      quizStepRaw === "results"
        ? quizStepRaw
        : null;
    const selectedCategory = (body as { selectedCategory?: unknown })
      .selectedCategory
      ? String((body as { selectedCategory?: unknown }).selectedCategory).slice(
          0,
          MAX_CATEGORY_LEN,
        )
      : null;
    const selectedBudget = (body as { selectedBudget?: unknown }).selectedBudget
      ? String((body as { selectedBudget?: unknown }).selectedBudget).slice(
          0,
          64,
        )
      : null;

    if (!leadId) {
      return publicJson(
        {
          error: "lead_required",
          requireLead: true,
          message: "Please share your name and email before chatting.",
        },
        { status: 400 },
      );
    }

    const lead = await getLeadById(shop, leadId);
    if (!lead) {
      return publicJson(
        {
          error: "lead_expired",
          requireLead: true,
          message:
            "Your session expired. Please enter your name and email again.",
        },
        { status: 400 },
      );
    }

    const isQuizContinue =
      quizStep === "budget" ||
      quizStep === "results" ||
      (Boolean(selectedCategory) && Boolean(selectedBudget));

    if (!question && !image && !isQuizContinue && quizStep !== "category") {
      return publicJson(
        { error: "empty_message", message: "Please enter a message or upload a product image." },
        { status: 400 },
      );
    }

    if (image) {
      if (!/^data:image\/(jpeg|jpg|png|webp|gif);base64,/i.test(image)) {
        return publicJson(
          { error: "invalid_image", message: "Only JPEG, PNG, WebP, or GIF uploads are supported." },
          { status: 400 },
        );
      }
      if (image.length > 7_000_000) {
        return publicJson(
          { error: "image_too_large", message: "Please upload an image under 5 MB." },
          { status: 400 },
        );
      }
    }

    const result = await answerBuyerQuestion({
      shop,
      admin: context.admin,
      question: question || (isQuizContinue ? "recommend" : "best product"),
      imageDataUrl: image,
      leadId: lead.id,
      quizStep,
      selectedCategory,
      selectedBudget,
    });

    return publicJson({ ...result, leadId: lead.id, planName: entitlements.planName });
  } catch (error) {
    if (error instanceof Response) throw error;
    return logAndPublicError(
      "apps.bundleguard.chat.action",
      error,
      500,
      "Something went wrong while loading products. Please try again in a moment.",
    );
  }
};
