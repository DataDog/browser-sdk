import type { Page } from '@playwright/test'

export type UrlPattern = string | RegExp

interface ClickAndWaitOptions {
  urlPattern?: UrlPattern
  readySelector?: string
}

export interface NavigationTarget extends ClickAndWaitOptions {
  clickSelector: string
}

export async function clickAndWait(
  page: Page,
  selector: string,
  { urlPattern, readySelector }: ClickAndWaitOptions = {}
) {
  if (urlPattern !== undefined) {
    await Promise.all([page.waitForURL(urlPattern), page.click(selector)])
  } else {
    await page.click(selector)
  }

  if (readySelector) {
    await page.waitForSelector(readySelector)
  }
}

export async function navigate(page: Page, navigation: NavigationTarget) {
  await clickAndWait(page, navigation.clickSelector, navigation)
}

export async function clickAndWaitForURL(page: Page, selector: string, urlPattern: UrlPattern, readySelector?: string) {
  await clickAndWait(page, selector, { urlPattern, readySelector })
}

export async function goHome(page: Page, homeNavigation: NavigationTarget) {
  await navigate(page, homeNavigation)
}
