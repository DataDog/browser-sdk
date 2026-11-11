import type { Page } from '@playwright/test'
import { getShopifyStorePassword } from '../../../../scripts/lib/secrets.ts'

export interface ShopifyStore {
  url: string
  getPassword: () => string
}

// V1: a Datadog-owned dev store, password-protected, used only to exercise browser-rum-shopify
// against a real storefront + checkout + Custom Pixel sandbox.
export const SHOPIFY_V1_STORE: ShopifyStore = {
  url: 'https://custom-pixel-e2e.myshopify.com/',
  getPassword: getShopifyStorePassword,
}

// V2: a dev store with the Datadog Shopify app installed (theme app embed + app Web Pixel). Its
// storefront password is not a secret.
export const SHOPIFY_V2_STORE: ShopifyStore = {
  url: 'https://devstore-vlkpbg9v.myshopify.com/',
  getPassword: () => 'sowpia',
}

// Dev stores gate every page behind a storefront password until unlocked for the session.
const PASSWORD_PATH = /\/password\/?$/

export async function unlockShopifyStorePassword(page: Page, store: ShopifyStore): Promise<void> {
  if (!PASSWORD_PATH.test(new URL(page.url()).pathname)) {
    return
  }

  await page.getByRole('textbox', { name: /password/i }).fill(store.getPassword())
  await page.getByRole('button', { name: /enter/i }).click()
  await page.waitForURL((url) => !PASSWORD_PATH.test(url.pathname))
}
