export type OosRule =
  | "block_when_any_component_oos"
  | "allow_partial_with_warning"
  | "ignore_continue_selling_components";

export type BundleStatus = "healthy" | "warning" | "blocked";

export interface ComponentInput {
  productVariantId: string;
  productId: string;
  productTitle: string;
  variantTitle: string;
  quantity: number;
  sku?: string | null;
}

export interface BundleHealthResult {
  status: BundleStatus;
  availableQuantity: number;
  blockReason: string | null;
  warnings: string[];
  componentIssues: Array<{
    productVariantId: string;
    productTitle: string;
    variantTitle: string;
    issue: string;
    inventoryPolicy: string;
    availableQty: number;
    requiredQty: number;
  }>;
}

export interface AuditIssue {
  bundleId: string;
  bundleTitle: string;
  componentTitle: string;
  issue: string;
  severity: "critical" | "warning";
  fixAction: string;
}
