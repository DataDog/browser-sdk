import { expect, test } from '@playwright/test'
import { createTest } from '../lib/framework'

// Skip non chromium browsers because --disable-web-security is chromium-only.
test.skip(() => test.info().project.name !== 'chromium', 'Shopify dev store is tested on chromium only')

// Bypass CSP and CORS restrictions in the Shopify dev store.
test.use({
  bypassCSP: true,
  launchOptions: { args: ['--disable-web-security'] },
})

const baseShopifyRumConfiguration = {
  trackUserInteractions: true,
}

const STOREFRONT_URL = 'https://custom-pixel-e2e.myshopify.com/'
const PRODUCT_URL = 'https://custom-pixel-e2e.myshopify.com/products/the-multi-managed-snowboard'

// Mirrors browser-rum-shopify's CHECKOUT_PATH (shopifyBindings.ts). Also matches the thank-you
// page, since its path still starts with /checkouts/.
const CHECKOUT_PATH = /\/(([a-z]{2}(-[a-z0-9]+)?)\/)?(checkouts?)(\/|$)/i
const THANK_YOU_PATH = /\/thank[_-]you/

const KNOWN_STORE_NOISE_URLS = [
  '/shopify-marketing_assets/static/ShopifySans--regular.woff',
  '/.well-known/shopify/monorail/unstable/produce_batch',
  '/private_access_tokens',
  'cloudfunctions.net/telemetry',
  // Synthetic Chromium error document for a blocked cross-origin frame
  'chrome-error://chromewebdata/',
]

const KNOWN_STORE_NOISE_MESSAGES = [
  'No data returned from autocomplete query',
  'event_observer_reporter',
  'frame-ancestors',
  // Transient store-side 5xx, unrelated to anything under test here.
  'responded with a status of 503',
]

function isKnownStoreNoise(log: { url?: string; message: string }) {
  return (
    KNOWN_STORE_NOISE_URLS.some((url) => log.url?.includes(url)) ||
    KNOWN_STORE_NOISE_MESSAGES.some((message) => log.message.includes(message))
  )
}

test.describe(() => {
  // The live dev store's Cloudflare bot protection can trip a verification wall under request volume,
  // even from rapid consecutive solo runs. Force this file's test(s) to run one at a time.
  test.describe.configure({ mode: 'serial' })

  // Cooldown so back-to-back invocations (manual loops, CI retries) can't hammer the store fast
  // enough to trip Cloudflare's wall or Shopify's checkout rate limit
  test.beforeAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 15_000))
  })

  // Flow: add to cart -> checkout -> thank you -> back to storefront
  createTest('shopify checkout views and actions')
    .withRum(baseShopifyRumConfiguration)
    .withShopifyApp()
    .run(async ({ page, intakeRegistry, flushEvents, withBrowserLogs, flushBrowserLogs }) => {
      // The full live-store checkout flow runs close to the default 30s test timeout.
      test.slow()

      await page.locator('div').filter({ hasText: 'Generated test data A theme' }).nth(1).click()
      await page.getByRole('link', { name: 'The Multi-managed Snowboard' }).click()

      // Wait for the product form's custom element to hydrate its AJAX submit handler, otherwise
      // clicking "Add to cart" below can fall through to a native form submission instead.
      await page.waitForLoadState('networkidle')

      // Poll the cart API directly instead of a fixed delay: the checkout session Shopify creates
      // can lag slightly behind the /cart/add response with no other client-visible signal.
      await Promise.all([
        page.waitForResponse((res) => res.url().includes('/cart/add') && res.ok()),
        page.getByRole('button', { name: 'Add to cart' }).click(),
      ])
      const getCartItemCount = () =>
        page.evaluate(async () => {
          const response = await fetch('/cart.js')
          // Treat a transient store-side 5xx as "not there yet" so expect.poll retries instead of
          // failing on a JSON parse error.
          if (!response.ok) {
            return 0
          }
          const cart = (await response.json()) as { item_count: number }
          return cart.item_count
        })
      await expect.poll(getCartItemCount, { timeout: 10000 }).toBeGreaterThan(0)
      await page.getByRole('button', { name: 'Check out' }).click()

      // Wait for the checkout page's Web Pixel to finish loading and subscribe to click events,
      // otherwise the first form field interactions below can go untracked.
      await page.waitForLoadState('networkidle')

      const emailInput = page.getByRole('textbox', { name: 'Email' })
      await emailInput.click()
      await emailInput.fill('ex@example.com')

      const firstNameInput = page.getByRole('textbox', { name: 'First name' })
      await firstNameInput.click()
      await firstNameInput.fill('xxx')

      const lastNameInput = page.getByRole('textbox', { name: 'Last name' })
      await lastNameInput.click()
      await lastNameInput.fill('xxx')

      const addressInput = page.getByRole('combobox', { name: 'Address' })
      await addressInput.click()
      await addressInput.fill('123 Main St')
      await page.keyboard.press('Escape')

      const cityInput = page.getByRole('textbox', { name: 'City' })
      await cityInput.click()
      await cityInput.fill('New York')

      await page.getByRole('combobox', { name: 'State' }).selectOption('New York')

      const zipInput = page.getByRole('textbox', { name: 'ZIP code' })
      await zipInput.click()
      await zipInput.fill('10001')

      // Bogus Gateway (Shopify's test payment gateway): card number "1" always succeeds. Card
      // fields are rendered in per-session iframes, so match on the stable name prefix.
      await page
        .frameLocator('iframe[name^="card-fields-number-"]')
        .getByRole('textbox', { name: 'Card number' })
        .fill('1')
      await page
        .frameLocator('iframe[name^="card-fields-expiry-"]')
        .getByRole('textbox', { name: 'Expiration date (MM / YY)' })
        .fill('12 / 99')
      await page
        .frameLocator('iframe[name^="card-fields-verification_value-"]')
        .getByRole('textbox', { name: 'Security code' })
        .fill('123')

      // Card fields sync back to the parent form via an async postMessage; give it a moment before
      // clicking "Pay now" so the click doesn't land before the form is submittable.
      await page.waitForTimeout(500)

      await page.getByRole('button', { name: 'Pay now' }).click()

      await expect(page.getByRole('heading', { name: /thank you/i })).toBeVisible({ timeout: 30000 })

      // flushEvents() navigates to /flush and leaves the page there, so it must run while still on
      // the thank-you page, before navigating anywhere else.
      await flushEvents()

      // Navigate back to the storefront to confirm the Theme Liquid DD_RUM instance picks the
      // session back up.
      await page.goto(STOREFRONT_URL)
      await flushEvents()

      // The Theme Liquid and Custom Pixel SDK instances share one browser session.
      const sessionIds = new Set([
        ...intakeRegistry.rumViewEvents.map((e) => e.session.id),
        ...intakeRegistry.rumActionEvents.map((e) => e.session.id),
      ])
      expect(sessionIds.size).toBe(1)

      const orderedViews = [...intakeRegistry.rumViewEvents]
        .sort((a, b) => a.date - b.date)
        .filter((event, index, events) => events.findIndex((e) => e.view.id === event.view.id) === index)

      expect(orderedViews.map((event) => event.view.url)).toEqual([
        STOREFRONT_URL,
        PRODUCT_URL,
        expect.stringMatching(CHECKOUT_PATH),
        expect.stringMatching(THANK_YOU_PATH),
        STOREFRONT_URL,
      ])

      const orderedActions = [...intakeRegistry.rumActionEvents].sort((a, b) => a.date - b.date)
      const actionSummaries = orderedActions.map((event) => ({
        target: event.action.target?.name,
        viewUrl: event.view.url,
      }))

      expect(actionSummaries).toEqual([
        {
          target: 'A theme and populated test store by Shopify to help you test commerce primitives.',
          viewUrl: STOREFRONT_URL,
        },
        { target: 'The Multi-managed Snowboard', viewUrl: STOREFRONT_URL },
        { target: 'Add to cart', viewUrl: PRODUCT_URL },
        { target: 'Check out', viewUrl: PRODUCT_URL },
        { target: 'contact_email', viewUrl: expect.stringMatching(CHECKOUT_PATH) },
        { target: 'delivery_first_name', viewUrl: expect.stringMatching(CHECKOUT_PATH) },
        { target: 'delivery_last_name', viewUrl: expect.stringMatching(CHECKOUT_PATH) },
        { target: 'delivery_address1', viewUrl: expect.stringMatching(CHECKOUT_PATH) },
        { target: 'delivery_city', viewUrl: expect.stringMatching(CHECKOUT_PATH) },
        { target: 'delivery_postal_code', viewUrl: expect.stringMatching(CHECKOUT_PATH) },
        { target: 'summary_pay_button', viewUrl: expect.stringMatching(CHECKOUT_PATH) },
      ])

      withBrowserLogs((logs) => {
        const unexpected = logs.filter((log) => log.level === 'error' && !isKnownStoreNoise(log))
        expect(unexpected).toHaveLength(0)
      })
      flushBrowserLogs()
    })
})
