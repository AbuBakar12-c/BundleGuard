/**
 * Full-store product catalog loader for accurate Shopper AI answers.
 * Uses Admin GraphQL pagination so we don't miss products.
 */

export type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

export interface CatalogVariant {
  id: string;
  title: string;
  sku: string | null;
  price: string;
  compareAtPrice: string | null;
  inventoryQuantity: number;
  inventoryPolicy: string;
  available: boolean;
}

export interface CatalogProduct {
  id: string;
  title: string;
  handle: string;
  description: string;
  vendor: string;
  productType: string;
  tags: string[];
  status: string;
  imageUrl: string | null;
  url: string;
  minPrice: string;
  maxPrice: string;
  available: boolean;
  totalInventory: number;
  variants: CatalogVariant[];
  collections: string[];
}

export interface StoreCatalog {
  shop: string;
  shopName: string;
  fetchedAt: string;
  productCount: number;
  products: CatalogProduct[];
}

type CacheEntry = { expiresAt: number; catalog: StoreCatalog };

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes — fresh enough, avoids rate limits
const PAGE_SIZE = 50;
const MAX_PRODUCTS = 250;

function isAvailable(
  inventoryQuantity: number | null | undefined,
  inventoryPolicy: string | null | undefined,
) {
  if ((inventoryQuantity ?? 0) > 0) return true;
  return inventoryPolicy === "CONTINUE";
}

function stripHtml(html: string | null | undefined) {
  return (html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

export function clearCatalogCache(shop?: string) {
  if (shop) cache.delete(shop);
  else cache.clear();
}

export async function fetchFullStoreCatalog(
  admin: AdminGraphql,
  shop: string,
  options?: { forceRefresh?: boolean },
): Promise<StoreCatalog> {
  const cached = cache.get(shop);
  if (
    !options?.forceRefresh &&
    cached &&
    cached.expiresAt > Date.now()
  ) {
    return cached.catalog;
  }

  const shopRes = await admin.graphql(
    `#graphql
      query BuyerShopInfo {
        shop {
          name
          primaryDomain { url }
        }
      }`,
  );
  if (!shopRes.ok) {
    throw new Error(`Shop lookup failed (HTTP ${shopRes.status})`);
  }
  const shopJson = (await shopRes.json()) as {
    data?: { shop?: { name?: string; primaryDomain?: { url?: string } | null } };
    errors?: Array<{ message: string }>;
  };
  if (shopJson.errors?.length) {
    throw new Error(
      `Shop GraphQL error: ${shopJson.errors.map((e) => e.message).join("; ")}`,
    );
  }
  const shopName = shopJson.data?.shop?.name ?? shop;
  const storefrontBase =
    shopJson.data?.shop?.primaryDomain?.url?.replace(/\/$/, "") ??
    `https://${shop}`;

  const products: CatalogProduct[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage && products.length < MAX_PRODUCTS) {
    const response = await admin.graphql(
      `#graphql
        query FullStoreCatalog($first: Int!, $after: String) {
          products(first: $first, after: $after, query: "status:active") {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              title
              handle
              descriptionHtml
              vendor
              productType
              tags
              status
              totalInventory
              featuredImage {
                url
                altText
              }
              collections(first: 10) {
                nodes { title }
              }
              variants(first: 30) {
                nodes {
                  id
                  title
                  sku
                  price
                  compareAtPrice
                  inventoryQuantity
                  inventoryPolicy
                }
              }
            }
          }
        }`,
      {
        variables: {
          first: PAGE_SIZE,
          after: cursor,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Catalog page failed (HTTP ${response.status})`);
    }

    const payload = (await response.json()) as {
      data?: {
        products?: {
          pageInfo?: { hasNextPage: boolean; endCursor: string | null };
          nodes?: Array<{
            id: string;
            title: string;
            handle: string;
            descriptionHtml?: string | null;
            vendor?: string | null;
            productType?: string | null;
            tags?: string[];
            status?: string;
            totalInventory?: number | null;
            featuredImage?: { url: string; altText: string | null } | null;
            collections?: { nodes?: Array<{ title: string }> };
            variants?: {
              nodes?: Array<{
                id: string;
                title: string;
                sku: string | null;
                price: string;
                compareAtPrice?: string | null;
                inventoryQuantity?: number | null;
                inventoryPolicy?: string | null;
              }>;
            };
          }>;
        };
      };
      errors?: Array<{ message: string }>;
    };

    if (payload.errors?.length) {
      throw new Error(
        `Catalog GraphQL error: ${payload.errors.map((e) => e.message).join("; ")}`,
      );
    }

    if (!payload.data?.products) {
      throw new Error("Catalog response missing products data");
    }

    const nodes = payload.data.products.nodes ?? [];
    for (const node of nodes) {
      const variants: CatalogVariant[] = (node.variants?.nodes ?? []).map(
        (v) => {
          const qty = v.inventoryQuantity ?? 0;
          const policy = v.inventoryPolicy ?? "DENY";
          return {
            id: v.id,
            title: v.title,
            sku: v.sku,
            price: v.price,
            compareAtPrice: v.compareAtPrice ?? null,
            inventoryQuantity: qty,
            inventoryPolicy: policy,
            available: isAvailable(qty, policy),
          };
        },
      );

      const prices = variants.map((v) => Number(v.price)).filter((n) => !Number.isNaN(n));
      const minPrice =
        prices.length > 0 ? Math.min(...prices).toFixed(2) : "0.00";
      const maxPrice =
        prices.length > 0 ? Math.max(...prices).toFixed(2) : "0.00";

      products.push({
        id: node.id,
        title: node.title,
        handle: node.handle,
        description: stripHtml(node.descriptionHtml),
        vendor: node.vendor ?? "",
        productType: node.productType ?? "",
        tags: node.tags ?? [],
        status: node.status ?? "ACTIVE",
        imageUrl: node.featuredImage?.url ?? null,
        url: `${storefrontBase}/products/${node.handle}`,
        minPrice,
        maxPrice,
        available: variants.some((v) => v.available),
        totalInventory: node.totalInventory ?? 0,
        variants,
        collections: (node.collections?.nodes ?? []).map((c) => c.title),
      });
    }

    hasNextPage = Boolean(payload.data.products.pageInfo?.hasNextPage);
    cursor = payload.data.products.pageInfo?.endCursor ?? null;
    if (!cursor) hasNextPage = false;
  }

  const catalog: StoreCatalog = {
    shop,
    shopName,
    fetchedAt: new Date().toISOString(),
    productCount: products.length,
    products,
  };

  cache.set(shop, { catalog, expiresAt: Date.now() + CACHE_TTL_MS });
  return catalog;
}

export function matchProductsFromCatalog(
  catalog: StoreCatalog,
  question: string,
  options?: { budgetMax?: number | null; limit?: number },
) {
  const q = question.toLowerCase();
  const tokens = q
    .replace(/[^\w\s$.-]/g, " ")
    .split(/\s+/)
    .filter(
      (t) =>
        t.length > 1 &&
        ![
          "show",
          "find",
          "please",
          "help",
          "me",
          "the",
          "a",
          "an",
          "for",
          "about",
          "your",
          "products",
          "product",
          "item",
          "items",
          "want",
          "need",
          "buy",
          "looking",
          "recommend",
          "tell",
          "know",
          "dont",
          "don't",
          "what",
          "which",
          "have",
          "any",
          "all",
          "store",
        ].includes(t),
    );

  const budgetMax = options?.budgetMax ?? null;
  const limit = options?.limit ?? 8;

  const scored = catalog.products.map((product) => {
    const haystack = [
      product.title,
      product.description,
      product.vendor,
      product.productType,
      ...product.tags,
      ...product.collections,
      ...product.variants.map((v) => `${v.title} ${v.sku ?? ""}`),
    ]
      .join(" ")
      .toLowerCase();

    let score = 0;
    if (tokens.length === 0) {
      // catalog browse — prefer available / popular-ish inventory
      score = product.available ? 5 : 1;
      score += Math.min(product.totalInventory, 20) * 0.1;
    } else {
      for (const token of tokens) {
        if (product.title.toLowerCase().includes(token)) score += 6;
        if (haystack.includes(token)) score += 2;
      }
    }

    if (product.available) score += 4;
    else score -= 4;

    const price = Number(product.minPrice);
    if (budgetMax != null) {
      if (price > 0 && price <= budgetMax) score += 5;
      else score -= 5;
    }

    return { product, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .filter((row) => (tokens.length === 0 ? true : row.score > 0))
    .slice(0, limit)
    .map((row) => row.product);
}

/** Compact context for the LLM — factual only, no fluff */
export interface StoreCatalogInsights {
  shopName: string;
  productCount: number;
  categories: Array<{ name: string; count: number }>;
  collections: Array<{ name: string; count: number }>;
  priceRange: { min: string; max: string } | null;
  suggestions: string[];
}

function countLabels(values: string[], limit = 8) {
  const counts = new Map<string, number>();
  for (const raw of values) {
    const name = raw.trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

/** Real store facts for Shopper AI — categories/suggestions from live catalog only */
export function buildStoreCatalogInsights(
  catalog: StoreCatalog,
): StoreCatalogInsights {
  const categories = countLabels(
    catalog.products.map((p) => p.productType),
    8,
  );
  const collections = countLabels(
    catalog.products.flatMap((p) => p.collections),
    8,
  );

  const prices = catalog.products
    .map((p) => Number(p.minPrice))
    .filter((n) => !Number.isNaN(n) && n > 0);
  const priceRange =
    prices.length > 0
      ? {
          min: Math.min(...prices).toFixed(2),
          max: Math.max(...prices).toFixed(2),
        }
      : null;

  const labelPool =
    collections.length > 0
      ? collections.map((c) => c.name)
      : categories.map((c) => c.name);

  const suggestions: string[] = [];
  if (catalog.productCount === 0) {
    suggestions.push("What products do you sell?");
  } else {
    suggestions.push("Help me choose ✨");
    for (const label of labelPool.slice(0, 2)) {
      suggestions.push(`Show ${label}`);
    }
    if (priceRange) {
      const mid = Math.max(
        1,
        Math.round((Number(priceRange.min) + Number(priceRange.max)) / 2),
      );
      suggestions.push(`Under $${mid}`);
    }
    suggestions.push("What's in stock?");
  }

  return {
    shopName: catalog.shopName,
    productCount: catalog.productCount,
    categories,
    collections,
    priceRange,
    suggestions: [...new Set(suggestions)].slice(0, 4),
  };
}

export function toAiProductContext(products: CatalogProduct[]) {
  return products.map((p) => ({
    title: p.title,
    handle: p.handle,
    url: p.url,
    vendor: p.vendor || undefined,
    type: p.productType || undefined,
    tags: p.tags.slice(0, 12),
    collections: p.collections.slice(0, 8),
    description: p.description.slice(0, 220) || undefined,
    priceFrom: p.minPrice,
    priceTo: p.maxPrice,
    inStock: p.available,
    inventory: p.totalInventory,
    variants: p.variants.slice(0, 8).map((v) => ({
      title: v.title,
      sku: v.sku || undefined,
      price: v.price,
      inStock: v.available,
      qty: v.inventoryQuantity,
    })),
  }));
}
