import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>BundleGuard</h1>
        <p className={styles.text}>
          Bundles that don&apos;t break when inventory changes. See why a kit is
          out of stock and fix it in one click.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: bundleguard-nkhkwmsy.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Open app
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Health dashboard.</strong> Every bundle shows healthy,
            warning, or blocked — plus the exact component that is stopping
            sales.
          </li>
          <li>
            <strong>OOS policy audit.</strong> Catch gift cards, continue-selling
            settings, and zero-stock components before customers hit checkout.
          </li>
          <li>
            <strong>One-click resync.</strong> Recalculate availability from live
            Shopify inventory without deleting and recreating the bundle.
          </li>
        </ul>
      </div>
    </div>
  );
}
