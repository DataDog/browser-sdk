import { SESSION_STORE_KEY } from '@datadog/browser-core'
import { createTest } from '../lib/framework'
import { test, expect, BrowserContext, Page } from '@playwright/test'

const DISABLE_LOCAL_STORAGE = '<script>Object.defineProperty(Storage.prototype, "getItem", { get: () => 42});</script>'
const DISABLE_COOKIES = '<script>Object.defineProperty(Document.prototype, "cookie", { get: () => 42});</script>'
const SESSION_ID_REGEX = /(?<!a)id=([\w-]+)/ // match `id` but not `aid`

test.describe('Session Stores', () => {
  test.describe('Cookies', () => {
    createTest('uses cookies to store the session')
      .withLogs()
      .withRum()
      .run(async ({ browserContext, page }) => {
        const cookieSessionId = await getSessionIdFromCookie(browserContext)
        const logsContext = await page.evaluate(() => window.DD_LOGS?.getInternalContext())
        const rumContext = await page.evaluate(() => window.DD_RUM?.getInternalContext())

        expect(logsContext?.session_id).toBe(cookieSessionId)
        expect(rumContext?.session_id).toBe(cookieSessionId)
      })

    createTest('when cookies are unavailable, Logs should start, but not RUM')
      .withLogs()
      .withRum()
      .withHead(DISABLE_COOKIES)
      .run(async ({ browserContext, page }) => {
        const logsContext = await page.evaluate(() => window.DD_LOGS?.getInternalContext())
        const rumContext = await page.evaluate(() => window.DD_RUM?.getInternalContext())

        expect(logsContext).not.toBeUndefined()
        expect(rumContext).toBeUndefined()
      })
  })

  test.describe('Local Storage', () => {
    createTest('uses localStorage to store the session')
      .withLogs({ sessionPersistence: 'local-storage' })
      .withRum({ sessionPersistence: 'local-storage' })
      .run(async ({ page }) => {
        const sessionId = await getSessionIdFromLocalStorage(page)

        const logsContext = await page.evaluate(() => window.DD_LOGS?.getInternalContext())
        const rumContext = await page.evaluate(() => window.DD_RUM?.getInternalContext())

        expect(logsContext?.session_id).toBe(sessionId)
        expect(rumContext?.session_id).toBe(sessionId)
      })

    createTest('when localStorage is unavailable, Logs should start, but not RUM')
      .withLogs({ sessionPersistence: 'local-storage' })
      .withRum({ sessionPersistence: 'local-storage' })
      .withHead(DISABLE_LOCAL_STORAGE)
      .run(async ({ page }) => {
        const logsContext = await page.evaluate(() => window.DD_LOGS?.getInternalContext())
        const rumContext = await page.evaluate(() => window.DD_RUM?.getInternalContext())

        expect(logsContext).not.toBeUndefined()
        expect(rumContext).toBeUndefined()
      })
  })

  createTest('allowFallbackToLocalStorage (deprecated)')
    .withLogs({ allowFallbackToLocalStorage: true })
    .withRum({ allowFallbackToLocalStorage: true })
    .withHead(DISABLE_COOKIES)
    .run(async ({ page }) => {
      const sessionId = await getSessionIdFromLocalStorage(page)

      const logsContext = await page.evaluate(() => window.DD_LOGS?.getInternalContext())
      const rumContext = await page.evaluate(() => window.DD_RUM?.getInternalContext())

      expect(logsContext?.session_id).toBe(sessionId)
      expect(rumContext?.session_id).toBe(sessionId)
    })
})

async function getSessionIdFromLocalStorage(page: Page): Promise<string | undefined> {
  const sessionStateString = await page.evaluate((key) => window.localStorage.getItem(key), SESSION_STORE_KEY)
  return sessionStateString?.match(SESSION_ID_REGEX)?.[1]
}

async function getSessionIdFromCookie(browserContext: BrowserContext): Promise<string | undefined> {
  const [cookie] = await browserContext.cookies()
  return cookie.value.match(SESSION_ID_REGEX)?.[1]
}
