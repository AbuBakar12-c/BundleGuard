import prisma from "../db.server";

export type LeadStatus = "pending" | "captured" | "contacted" | "qualified";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string) {
  return EMAIL_RE.test(email);
}

export async function captureShopperLead(options: {
  shop: string;
  name: string;
  email: string;
  sessionKey?: string | null;
  source?: string;
}) {
  const name = options.name.trim().slice(0, 120);
  const email = options.email.trim().toLowerCase().slice(0, 254);

  if (!name || name.length < 2) {
    throw new Error("Please enter your full name.");
  }
  if (!isValidEmail(email)) {
    throw new Error("Please enter a valid email address.");
  }

  const existing = await prisma.shopperLead.findUnique({
    where: {
      shop_email: { shop: options.shop, email },
    },
  });

  if (existing) {
    return prisma.shopperLead.update({
      where: { id: existing.id },
      data: {
        name,
        status: existing.status === "pending" ? "captured" : existing.status,
        sessionKey: options.sessionKey ?? existing.sessionKey,
        source: options.source ?? existing.source,
      },
    });
  }

  return prisma.shopperLead.create({
    data: {
      shop: options.shop,
      name,
      email,
      status: "captured",
      source: options.source ?? "shopper_chat",
      sessionKey: options.sessionKey ?? null,
    },
  });
}

export async function getLeadById(shop: string, leadId: string) {
  return prisma.shopperLead.findFirst({
    where: { id: leadId, shop },
  });
}

export async function listShopperLeads(shop: string, take = 50) {
  return prisma.shopperLead.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export async function getLeadStats(shop: string) {
  const [total, pending, captured, contacted, qualified, last7d] =
    await Promise.all([
      prisma.shopperLead.count({ where: { shop } }),
      prisma.shopperLead.count({ where: { shop, status: "pending" } }),
      prisma.shopperLead.count({ where: { shop, status: "captured" } }),
      prisma.shopperLead.count({ where: { shop, status: "contacted" } }),
      prisma.shopperLead.count({ where: { shop, status: "qualified" } }),
      prisma.shopperLead.count({
        where: {
          shop,
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

  return { total, pending, captured, contacted, qualified, last7d };
}

/** Last N days of lead captures (for simple charts). */
export async function getLeadDailyTrend(shop: string, days = 7) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  const leads = await prisma.shopperLead.findMany({
    where: { shop, createdAt: { gte: start } },
    select: { createdAt: true, status: true },
    orderBy: { createdAt: "asc" },
  });

  const buckets: Array<{ date: string; count: number; label: string }> = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    buckets.push({
      date: key,
      count: 0,
      label: d.toLocaleDateString(undefined, { weekday: "short" }),
    });
  }

  for (const lead of leads) {
    const key = lead.createdAt.toISOString().slice(0, 10);
    const bucket = buckets.find((b) => b.date === key);
    if (bucket) bucket.count += 1;
  }

  return buckets;
}

export async function updateLeadStatus(
  shop: string,
  leadId: string,
  status: LeadStatus,
) {
  const lead = await getLeadById(shop, leadId);
  if (!lead) return null;
  // Tenant-safe update: shop must match
  return prisma.shopperLead.update({
    where: { id: lead.id },
    data: { status },
  });
}
