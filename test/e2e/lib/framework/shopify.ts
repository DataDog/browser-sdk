import type { Page } from '@playwright/test'
import { getShopifyStorePassword } from '../../../../scripts/lib/secrets.ts'

export type ShopifyApp = 'custom-pixel' | 'web-pixel'

// Datadog-owned dev stores, password-protected, used only to exercise browser-rum-shopify against a
// real storefront + checkout:
// - custom-pixel: the RUM SDK in the Theme Liquid and in a Custom Pixel sandbox
// - web-pixel: a Shopify app with the RUM SDK in a Theme App Extension and the Web Pixel SDK in a
//   Web Pixel app extension (https://github.com/BeltranBulbarellaDD/poc-dd-rum-sh)
export const SHOPIFY_STORES: { [app in ShopifyApp]: { url: string; getPassword: () => string } } = {
  'custom-pixel': {
    url: 'https://custom-pixel-e2e.myshopify.com/',
    getPassword: getShopifyStorePassword,
  },
  'web-pixel': {
    url: 'https://devstore-vlkpbg9v.myshopify.com/',
    // POC dev store: its password protects nothing sensitive
    getPassword: () => 'sowpia',
  },
}

// Dev stores gate every page behind a storefront password until unlocked for the session.
const PASSWORD_PATH = /\/password\/?$/

export async function unlockShopifyStorePassword(page: Page, app: ShopifyApp): Promise<void> {
  if (!PASSWORD_PATH.test(new URL(page.url()).pathname)) {
    return
  }

  await page.getByRole('textbox', { name: /password/i }).fill(SHOPIFY_STORES[app].getPassword())
  await page.getByRole('button', { name: /enter/i }).click()
  await page.waitForURL((url) => !PASSWORD_PATH.test(url.pathname))
}
