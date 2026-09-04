/**
 * Public privacy policy — required for App Store listing URL.
 * Set SUPPORT_EMAIL / PRIVACY_EMAIL / COMPANY_NAME in the environment.
 */
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

export async function loader(_args: LoaderFunctionArgs) {
  return {
    supportEmail:
      process.env.SUPPORT_EMAIL?.trim() ||
      process.env.PRIVACY_EMAIL?.trim() ||
      null,
    company: process.env.COMPANY_NAME?.trim() || "the BundleGuard app developer",
    privacyUrl: process.env.PRIVACY_POLICY_URL?.trim() || null,
  };
}

export default function PrivacyPolicyPage() {
  const { supportEmail, company, privacyUrl } = useLoaderData<typeof loader>();

  return (
    <main
      style={{
        maxWidth: 720,
        margin: "40px auto",
        padding: "0 20px 60px",
        fontFamily:
          'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: "#202223",
        lineHeight: 1.55,
      }}
    >
      <h1>BundleGuard Privacy Policy</h1>
      <p>
        <em>Last updated: September 4, 2026</em>
      </p>

      <h2>Who we are</h2>
      <p>
        BundleGuard is a Shopify application operated by {company}. It helps
        merchants manage product-bundle inventory health, audits, and optional
        AI assistants.
      </p>

      <h2>Data we process</h2>
      <ul>
        <li>
          <strong>Shop data</strong> — products, variants, inventory levels,
          locations, and order webhook events needed to calculate bundle health.
        </li>
        <li>
          <strong>Merchant chat</strong> — questions and answers stored for the
          Admin assistant history.
        </li>
        <li>
          <strong>Shopper leads</strong> — name and email submitted when a
          storefront shopper starts the Shopper AI widget, plus related chat
          messages.
        </li>
        <li>
          <strong>Session tokens</strong> — Shopify offline session credentials
          required to call Admin APIs on behalf of the installed shop.
        </li>
        <li>
          <strong>Compliance exports</strong> — temporary records created to
          fulfill Shopify GDPR data requests.
        </li>
      </ul>

      <h2>How we use data</h2>
      <p>
        Data is used only to provide BundleGuard features: inventory sync,
        audits, billing, and AI assistance. We do not sell personal data.
      </p>

      <h2>AI providers</h2>
      <p>
        When enabled, prompts may be sent to OpenAI to generate assistant
        replies. Do not include secrets in chat messages. Shopper AI answers
        from the merchant&apos;s live catalog and must not invent products or
        prices.
      </p>

      <h2>Retention &amp; deletion</h2>
      <p>
        When a merchant uninstalls the app, we delete shop-scoped data
        (sessions, bundles, alerts, chats, leads, settings, compliance
        exports). Shopify also sends mandatory compliance webhooks (
        <code>customers/data_request</code>, <code>customers/redact</code>,{" "}
        <code>shop/redact</code>) which we honor.
      </p>

      <h2>Contact</h2>
      {supportEmail ? (
        <p>
          For privacy requests, email{" "}
          <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
          {privacyUrl ? (
            <>
              {" "}
              or visit <a href={privacyUrl}>{privacyUrl}</a>
            </>
          ) : null}
          .
        </p>
      ) : (
        <p>
          For privacy requests, contact the developer via the Shopify App Store
          listing. Set <code>SUPPORT_EMAIL</code> (or{" "}
          <code>PRIVACY_EMAIL</code>) in the app environment before App Store
          submission.
        </p>
      )}
    </main>
  );
}
