import { useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, redirect, useActionData, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate, isTestCharge } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { createBundle, getBundlesForShop } from "../services/bundles.server";
import {
  STARTER_PLAN,
  GROWTH_PLAN,
  PRO_PLAN,
  bundleLimitForPlan,
} from "../plans";
import type { ComponentInput, OosRule } from "../models/bundles.types";

type PickedProduct = {
  id: string;
  title: string;
  variants?: Array<{ id: string; title?: string }>;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session, billing } = await authenticate.admin(request);
  const formData = await request.formData();

  const title = String(formData.get("title") ?? "").trim();
  const price = String(formData.get("price") ?? "0.00").trim();
  const oosRule = String(
    formData.get("oosRule") ?? "block_when_any_component_oos",
  ) as OosRule;
  const componentsRaw = String(formData.get("components") ?? "[]");

  if (!title) {
    return { error: "Bundle title is required" };
  }

  let components: ComponentInput[] = [];
  try {
    components = JSON.parse(componentsRaw) as ComponentInput[];
  } catch {
    return { error: "Invalid component payload" };
  }

  components = components
    .filter(
      (component) =>
        component.productVariantId &&
        !component.productVariantId.includes("REPLACE") &&
        !component.productVariantId.endsWith("/0"),
    )
    .map((component) => ({
      ...component,
      quantity: Math.min(
        99,
        Math.max(1, Math.floor(Number(component.quantity) || 1)),
      ),
    }));

  if (components.length < 2) {
    return {
      error: "Pick at least 2 products with the Select products button",
    };
  }

  const { appSubscriptions } = await billing.check({
    plans: [STARTER_PLAN, GROWTH_PLAN, PRO_PLAN],
    isTest: isTestCharge(),
  });
  const limit = bundleLimitForPlan(appSubscriptions[0]?.name);
  const existing = await getBundlesForShop(session.shop);
  if (existing.length >= limit) {
    return {
      error: `Your ${appSubscriptions[0]?.name ?? "Starter"} plan allows ${limit} bundles. Upgrade on the Plan page.`,
    };
  }

  try {
    const result = await createBundle(admin, session.shop, {
      title,
      price,
      oosRule,
      components,
    });

    return redirect(`/app/bundles/${result.bundle?.id}`);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to create bundle",
    };
  }
};

export default function NewBundle() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const isSubmitting = navigation.state === "submitting";
  const [components, setComponents] = useState<ComponentInput[]>([]);

  const pickProducts = async () => {
    const selected = (await shopify.resourcePicker({
      type: "product",
      multiple: true,
      action: "select",
    })) as PickedProduct[] | undefined;

    if (!selected?.length) {
      return;
    }

    const nextComponents: ComponentInput[] = [];

    for (const product of selected) {
      const variants = product.variants?.length
        ? product.variants
        : [{ id: "", title: "Default" }];

      for (const variant of variants) {
        if (!variant.id) {
          continue;
        }

        nextComponents.push({
          productId: product.id,
          productVariantId: variant.id,
          productTitle: product.title,
          variantTitle: variant.title || "Default",
          quantity: 1,
        });
      }
    }

    setComponents(nextComponents);
  };

  return (
    <s-page heading="Create bundle">
      <s-link slot="breadcrumb-actions" href="/app">
        Dashboard
      </s-link>

      {actionData?.error && (
        <s-banner tone="critical" heading="Could not create bundle">
          {actionData.error}
        </s-banner>
      )}

      <Form method="post">
        <input type="hidden" name="components" value={JSON.stringify(components)} />

        <s-section heading="Bundle details">
          <s-stack direction="block" gap="base">
            <s-text-field
              label="Bundle title"
              name="title"
              required
              placeholder="Summer Skincare Set"
            />
            <s-text-field
              label="Bundle price"
              name="price"
              value="49.00"
              details="Price for the bundle product variant"
            />
            <s-select
              label="OOS rule"
              name="oosRule"
              value="block_when_any_component_oos"
            >
              <s-option value="block_when_any_component_oos">
                Block when any component is out of stock
              </s-option>
              <s-option value="allow_partial_with_warning">
                Allow with warning when policies conflict
              </s-option>
              <s-option value="ignore_continue_selling_components">
                Ignore continue-selling components in math
              </s-option>
            </s-select>
          </s-stack>
        </s-section>

        <s-section heading="Components">
          <s-stack direction="block" gap="base">
            <s-button type="button" variant="secondary" onClick={pickProducts}>
              Select products
            </s-button>

            {components.length === 0 ? (
              <s-paragraph>
                Choose 2 or more products from your store. Those become the
                bundle components.
              </s-paragraph>
            ) : (
              components.map((component) => (
                <s-box
                  key={component.productVariantId}
                  padding="base"
                  border="base"
                  borderRadius="base"
                  background="subdued"
                >
                  <s-stack direction="block" gap="base">
                    <s-text type="strong">
                      {component.productTitle} — {component.variantTitle}
                    </s-text>
                    <label>
                      Qty per bundle{" "}
                      <input
                        type="number"
                        min={1}
                        max={99}
                        value={component.quantity}
                        onChange={(event) => {
                          const nextQty = Math.min(
                            99,
                            Math.max(1, Number(event.target.value) || 1),
                          );
                          setComponents((prev) =>
                            prev.map((row) =>
                              row.productVariantId ===
                              component.productVariantId
                                ? { ...row, quantity: nextQty }
                                : row,
                            ),
                          );
                        }}
                        style={{
                          width: 72,
                          marginLeft: 8,
                          padding: "6px 8px",
                          borderRadius: 8,
                          border: "1px solid #c9cccf",
                        }}
                      />
                    </label>
                  </s-stack>
                </s-box>
              ))
            )}
          </s-stack>
        </s-section>

        <s-button
          type="submit"
          variant="primary"
          {...(isSubmitting ? { loading: true } : {})}
        >
          Create bundle
        </s-button>
      </Form>

      <s-section slot="aside" heading="Setup tip">
        <s-paragraph>
          Click Select products, pick real catalog items, then create the
          bundle. BundleGuard will calculate inventory health automatically.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
