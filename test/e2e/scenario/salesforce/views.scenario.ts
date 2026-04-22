import { test, expect } from '@playwright/test'
import {
  createRumViewTracker,
  flushRumEvents,
  getExpectedViewUrl,
  normalizePathname,
  openLightningWithSf,
} from '../../lib/salesforce'

const SALESFORCE_EBIKES_SITE_URL = process.env.SALESFORCE_EBIKES_SITE_URL
const SALESFORCE_EBIKES_ORG_ALIAS = process.env.SALESFORCE_EBIKES_ORG_ALIAS

test.describe('salesforce view tracking', () => {
  test('emits views while navigating in Experience Cloud', async ({ page }) => {
    test.skip(!SALESFORCE_EBIKES_SITE_URL, 'Set SALESFORCE_EBIKES_SITE_URL to run Salesforce Experience tests.')

    const baseUrl = SALESFORCE_EBIKES_SITE_URL!
    const viewTracker = createRumViewTracker(page)
    const baseHomePath = normalizePathname(new URL(baseUrl).pathname)

    await page.goto(baseUrl)
    await page.getByRole('link', { name: /^Product Explorer$/i }).click()
    await page.waitForURL('**/product-explorer')

    await page.getByRole('link', { name: /FUSE X1/i }).click()
    await page.waitForURL('**/product/**')

    await page.getByRole('link', { name: /^Home$/i }).click()
    await page.waitForURL((url) => normalizePathname(url.pathname) === baseHomePath)

    await flushRumEvents(page)
    await viewTracker.waitForViewCount(4)

    const productExplorerPath = `${baseHomePath}/product-explorer`.replace(/\/+/g, '/')
    const productDetailView = viewTracker.viewEvents.find((event) => event.view.name?.includes('/product/'))

    expect(viewTracker.viewEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          view: expect.objectContaining({
            name: baseHomePath,
            url: getExpectedViewUrl(baseUrl, baseHomePath),
          }),
        }),
        expect.objectContaining({
          view: expect.objectContaining({
            name: productExplorerPath,
            url: getExpectedViewUrl(baseUrl, productExplorerPath),
          }),
        }),
      ])
    )
    expect(productDetailView).toEqual(
      expect.objectContaining({
        view: expect.objectContaining({
          url: expect.stringContaining('/product/'),
        }),
      })
    )
  })

  test('emits views while navigating in Lightning Experience', async ({ page }) => {
    test.skip(!SALESFORCE_EBIKES_ORG_ALIAS, 'Set SALESFORCE_EBIKES_ORG_ALIAS to run Salesforce Lightning tests.')

    const viewTracker = createRumViewTracker(page)
    await openLightningWithSf(page, SALESFORCE_EBIKES_ORG_ALIAS!, '/lightning/n/Product_Explorer')
    await page.waitForURL('**/lightning/n/Product_Explorer')

    await page.getByRole('link', { name: /FUSE X1/i }).click()
    await page.waitForURL('**/lightning/r/**/view')

    const recordPath = normalizePathname(new URL(page.url()).pathname)

    await page.goto(new URL('/lightning/n/Product_Explorer', page.url()).href)
    await page.waitForURL('**/lightning/n/Product_Explorer')

    await flushRumEvents(page)
    await viewTracker.waitForViewCount(3)

    expect(viewTracker.viewEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          view: expect.objectContaining({
            name: '/lightning/n/Product_Explorer',
            url: expect.stringContaining('/lightning/n/Product_Explorer'),
          }),
        }),
        expect.objectContaining({
          view: expect.objectContaining({
            name: recordPath,
            url: expect.stringContaining(recordPath),
          }),
        }),
      ])
    )

    expect(
      viewTracker.viewEvents.filter((event) => event.view.name === '/lightning/n/Product_Explorer').length
    ).toBeGreaterThanOrEqual(2)
  })
})
