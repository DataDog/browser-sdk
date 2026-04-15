import type { Page } from '@playwright/test'

export type UrlPattern = string | RegExp

export async function clickAndWaitForURL(page: Page, selector: string, urlPattern: UrlPattern) {
  await Promise.all([page.waitForURL(urlPattern), page.click(selector)])
}

export async function goHome(page: Page, homeUrlPattern: UrlPattern) {
  await clickAndWaitForURL(page, 'text=Back to Home', homeUrlPattern)
  await page.waitForSelector('text=Go to User 42')
}
