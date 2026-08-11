import type { Page } from '@playwright/test'
import { getShopifyStorePassword } from '../../../../scripts/lib/secrets.ts'

// A Datadog-owned dev store, password-protected, used only to exercise browser-rum-shopify
// against a real storefront + checkout + Custom Pixel sandbox.
const SHOPIFY_STORE_URL = 'https://custom-pixel-e2e.myshopify.com/'

export function buildShopifyUrl(): string {
  return SHOPIFY_STORE_URL
}

// Dev stores gate every page behind a storefront password until unlocked for the session.
const PASSWORD_PATH = /\/password\/?$/

export async function unlockShopifyStorePassword(page: Page): Promise<void> {
  if (!PASSWORD_PATH.test(new URL(page.url()).pathname)) {
    return
  }

  await page.getByRole('textbox', { name: /password/i }).fill(getShopifyStorePassword())
  await page.getByRole('button', { name: /enter/i }).click()
  await page.waitForURL((url) => !PASSWORD_PATH.test(url.pathname))
}
