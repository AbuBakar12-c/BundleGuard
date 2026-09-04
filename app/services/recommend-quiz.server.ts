/**
 * Zipchat-style recommendation quiz — options come ONLY from live catalog.
 * Never invent categories like electronics/clothes/phones if they are not in the store.
 */

import type { CatalogProduct, StoreCatalog } from "./catalog.server";
import { buildStoreCatalogInsights } from "./catalog.server";

export type QuizOption = {
  id: string;
  label: string;
  value: string;
};

export type RecommendQuizCard = {
  step: "category" | "budget" | "results";
  title: string;
  options: QuizOption[];
  selectedCategory?: string | null;
  selectedBudget?: string | null;
  page: number;
  totalPages: number;
};

function productMatchesCategory(product: CatalogProduct, category: string) {
  if (!category || category === "__all__") return true;
  const needle = category.toLowerCase();
  if (product.productType.toLowerCase() === needle) return true;
  if (product.collections.some((c) => c.toLowerCase() === needle)) return true;
  if (product.tags.some((t) => t.toLowerCase() === needle)) return true;
  return false;
}

export function filterCatalogByCategory(
  catalog: StoreCatalog,
  category: string | null | undefined,
) {
  if (!category || category === "__all__" || category === "__other__") {
    return catalog.products;
  }
  return catalog.products.filter((p) => productMatchesCategory(p, category));
}

export function filterProductsByBudget(
  products: CatalogProduct[],
  budgetId: string | null | undefined,
) {
  if (!budgetId || budgetId === "__any__") return products;

  const match = budgetId.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?|inf)$/);
  if (!match) return products;

  const min = Number(match[1]);
  const max = match[2] === "inf" ? Number.POSITIVE_INFINITY : Number(match[2]);

  return products.filter((p) => {
    const price = Number(p.minPrice);
    if (Number.isNaN(price) || price <= 0) return false;
    return price >= min && price <= max;
  });
}

/** Build budget bands from real prices in the filtered product set */
export function buildBudgetOptionsFromProducts(
  products: CatalogProduct[],
): QuizOption[] {
  const prices = products
    .map((p) => Number(p.minPrice))
    .filter((n) => !Number.isNaN(n) && n > 0)
    .sort((a, b) => a - b);

  if (prices.length === 0) {
    return [{ id: "__any__", label: "Any budget ✨", value: "__any__" }];
  }

  const min = prices[0];
  const max = prices[prices.length - 1];

  if (max - min < 5) {
    return [
      {
        id: `${min.toFixed(0)}-${max.toFixed(0)}`,
        label: `Around $${min.toFixed(0)}-$${max.toFixed(0)}`,
        value: `${min.toFixed(0)}-${max.toFixed(0)}`,
      },
      { id: "__any__", label: "Any budget ✨", value: "__any__" },
    ];
  }

  const q1 = prices[Math.floor((prices.length - 1) * 0.33)] ?? min;
  const q2 = prices[Math.floor((prices.length - 1) * 0.66)] ?? max;

  const bands: Array<{ min: number; max: number | "inf"; label: string }> = [
    { min: 0, max: q1, label: `Under $${Math.ceil(q1)}` },
    {
      min: q1,
      max: q2,
      label: `$${Math.floor(q1)}-$${Math.ceil(q2)}`,
    },
    {
      min: q2,
      max: "inf",
      label: `Over $${Math.floor(q2)}`,
    },
  ];

  // Keep only bands that have at least one product
  const options: QuizOption[] = [];
  for (const band of bands) {
    const bandMax = band.max === "inf" ? Number.POSITIVE_INFINITY : band.max;
    const count = prices.filter((p) => p >= band.min && p <= bandMax).length;
    if (count === 0) continue;
    const id = `${band.min}-${band.max === "inf" ? "inf" : band.max}`;
    options.push({
      id,
      label: `${band.label} (${count} item${count === 1 ? "" : "s"})`,
      value: id,
    });
  }

  options.push({ id: "__any__", label: "Any budget ✨", value: "__any__" });
  return options;
}

export function buildCategoryOptionsFromCatalog(
  catalog: StoreCatalog,
): QuizOption[] {
  const insights = buildStoreCatalogInsights(catalog);
  const labels =
    insights.collections.length > 0
      ? insights.collections
      : insights.categories;

  const options: QuizOption[] = labels.slice(0, 6).map((item) => ({
    id: item.name,
    label: `${item.name} (${item.count})`,
    value: item.name,
  }));

  if (options.length === 0) {
    options.push({
      id: "__all__",
      label: `Browse all products (${catalog.productCount})`,
      value: "__all__",
    });
  } else {
    options.push({
      id: "__other__",
      label: "Show me everything ✨",
      value: "__other__",
    });
  }

  return options;
}

export function buildCategoryQuizCard(catalog: StoreCatalog): RecommendQuizCard {
  return {
    step: "category",
    title: "Which category interests you?",
    options: buildCategoryOptionsFromCatalog(catalog),
    page: 1,
    totalPages: 2,
  };
}

export function buildBudgetQuizCard(
  catalog: StoreCatalog,
  category: string,
): RecommendQuizCard {
  const filtered = filterCatalogByCategory(catalog, category);
  const subtitle =
    category && category !== "__all__" && category !== "__other__"
      ? `Budget for ${category}`
      : "What's your budget?";
  return {
    step: "budget",
    title: subtitle,
    options: buildBudgetOptionsFromProducts(filtered),
    selectedCategory: category,
    page: 2,
    totalPages: 2,
  };
}

export function resolveRecommendQuizPicks(
  catalog: StoreCatalog,
  category: string | null | undefined,
  budgetId: string | null | undefined,
  limit = 3,
) {
  const byCategory = filterCatalogByCategory(catalog, category);
  const byBudget = filterProductsByBudget(byCategory, budgetId);
  const pool = byBudget.length > 0 ? byBudget : byCategory;

  return [...pool]
    .sort((a, b) => {
      if (a.available !== b.available) return a.available ? -1 : 1;
      return Number(a.minPrice) - Number(b.minPrice);
    })
    .slice(0, limit);
}
