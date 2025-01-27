import { SESSION_STORE_KEY, SESSION_TIME_OUT_DELAY } from '@datadog/browser-core'
import type { SessionState } from '@datadog/browser-core'
import type { BrowserContext, Page } from '@playwright/test'
import { expect } from '@playwright/test'

import { setCookie } from './browser'

export async function renewSession(page: Page, browserContext: BrowserContext) {
  await expireSession(page, browserContext)
  const documentElement = page.locator('html')
  await documentElement.click()

  expect((await findSessionCookie(browserContext))?.isExpired).not.toEqual('1')
}

export async function expireSession(page: Page, browserContext: BrowserContext) {
  // mock expire session with anonymous id
  const cookies = await browserContext.cookies()
  const anonymousId = cookies[0]?.value.match(/aid=[a-z0-9]+/)
  const expireCookie = `isExpired=1&${anonymousId && anonymousId[0]}`

  await setCookie(page, SESSION_STORE_KEY, expireCookie, SESSION_TIME_OUT_DELAY)

  expect((await findSessionCookie(browserContext))?.isExpired).toEqual('1')

  // Cookies are cached for 1s, wait until the cache expires
  await page.waitForTimeout(1100)
}

export async function findSessionCookie(browserContext: BrowserContext) {
  const cookies = await browserContext.cookies()
  // In some case, the session cookie is returned but with an empty value. Let's consider it expired
  // in this case.
  const rawValue = cookies[0]?.value
  if (!rawValue) {
    return
  }
  return Object.fromEntries(rawValue.split('&').map((part: string) => part.split('='))) as SessionState
}
