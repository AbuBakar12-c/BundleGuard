/**
 * Shop-scoped data lifecycle for uninstall + GDPR compliance webhooks.
 */

import prisma from "../db.server";

export async function purgeShopData(shop: string) {
  // Order matters for FKs: messages → leads → bundles (components cascade) → rest
  await prisma.$transaction([
    prisma.buyerChatMessage.deleteMany({ where: { shop } }),
    prisma.shopperLead.deleteMany({ where: { shop } }),
    prisma.chatMessage.deleteMany({ where: { shop } }),
    prisma.inventoryAlert.deleteMany({ where: { shop } }),
    prisma.bundle.deleteMany({ where: { shop } }),
    prisma.shopAssistantSettings.deleteMany({ where: { shop } }),
    prisma.complianceExport.deleteMany({ where: { shop } }),
    prisma.webhookDelivery.deleteMany({ where: { shop } }),
    prisma.session.deleteMany({ where: { shop } }),
  ]);
}

export async function redactCustomerData(shop: string, email?: string | null) {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) {
    return { deletedLeads: 0, deletedMessages: 0 };
  }

  const leads = await prisma.shopperLead.findMany({
    where: { shop, email: normalized },
    select: { id: true },
  });
  const leadIds = leads.map((l) => l.id);

  const deletedMessages = await prisma.buyerChatMessage.deleteMany({
    where: {
      shop,
      OR: [
        ...(leadIds.length > 0 ? [{ leadId: { in: leadIds } }] : []),
        { text: { contains: normalized } },
      ],
    },
  });

  const deletedLeads = await prisma.shopperLead.deleteMany({
    where: { shop, email: normalized },
  });

  // Also remove stored data-request exports for this email
  await prisma.complianceExport.deleteMany({
    where: { shop, email: normalized },
  });

  return {
    deletedLeads: deletedLeads.count,
    deletedMessages: deletedMessages.count,
  };
}

export async function exportCustomerData(shop: string, email?: string | null) {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) {
    return { shop, email: null, leads: [], messages: [] };
  }

  const leads = await prisma.shopperLead.findMany({
    where: { shop, email: normalized },
    orderBy: { createdAt: "desc" },
  });

  const leadIds = leads.map((l) => l.id);
  const messages = await prisma.buyerChatMessage.findMany({
    where: {
      shop,
      OR: [
        ...(leadIds.length > 0 ? [{ leadId: { in: leadIds } }] : []),
        { text: { contains: normalized } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return {
    shop,
    email: normalized,
    leads: leads.map((l) => ({
      id: l.id,
      name: l.name,
      email: l.email,
      status: l.status,
      source: l.source,
      createdAt: l.createdAt.toISOString(),
    })),
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      text: m.text,
      leadId: m.leadId,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

/** Persist a GDPR data_request export so merchants can fulfill it (not log-only). */
export async function storeComplianceExport(options: {
  shop: string;
  topic: string;
  email?: string | null;
  payload: unknown;
}) {
  return prisma.complianceExport.create({
    data: {
      shop: options.shop,
      topic: options.topic,
      email: options.email?.trim().toLowerCase() || null,
      payload: JSON.stringify(options.payload).slice(0, 500_000),
    },
  });
}

/**
 * Idempotent webhook guard. Returns true if this delivery is new and should be processed.
 * Uses Shopify webhook id header when provided.
 */
export async function claimWebhookDelivery(options: {
  shop: string;
  topic: string;
  webhookId: string | null;
}) {
  if (!options.webhookId) return true;

  try {
    await prisma.webhookDelivery.create({
      data: {
        shop: options.shop,
        topic: options.topic,
        webhookId: options.webhookId,
      },
    });
    return true;
  } catch {
    // Unique constraint → already processed
    return false;
  }
}
