import { SESSION_STORE_KEY, MEMORY_SESSION_STORE_KEY } from '@datadog/browser-core'
import type { BrowserContext, Page } from '@playwright/test'
import { test, expect } from '@playwright/test'
import type { RumPublicApi } from '@datadog/browser-rum-core'
import { bundleSetup, createTest } from '../lib/framework'

const DISABLE_LOCAL_STORAGE = '<script>Object.defineProperty(Storage.prototype, "getItem", { get: () => 42});</script>'
const DISABLE_COOKIES = '<script>Object.defineProperty(Document.prototype, "cookie", { get: () => 42});</script>'
const SESSION_ID_REGEX = /(?<!a)id=([\w-]+)/ // match `id` but not `aid`

const FULL_HOSTNAME = 'foo.bar.localhost'

// Note: this isn't entirely exact, ideally it should be `.localhost`, but the Browser
// SDK skips the toplevel domain (ex: .com) and starts with the second level domain
// directly (ex: .foo.com) as it's fine in 99.9% of cases and we save one cookie check.
const MAIN_HOSTNAME = '.bar.localhost'

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
      .run(async ({ page }) => {
        const logsContext = await page.evaluate(() => window.DD_LOGS?.getInternalContext())
        const rumContext = await page.evaluate(() => window.DD_RUM?.getInternalContext())

        expect(logsContext).not.toBeUndefined()
        expect(rumContext).toBeUndefined()
      })

    test.describe('trackSessionAcrossSubdomains: false', () => {
      createTest('stores the cookie on the full host name')
        .withRum({ trackSessionAcrossSubdomains: false })
        .withHostName(FULL_HOSTNAME)
        .run(async ({ browserContext }) => {
          const cookies = await browserContext.cookies()
          expect(cookies).toEqual([
            expect.objectContaining({
              domain: FULL_HOSTNAME,
            }),
          ])
        })

      createTest('when injected in a iframe without `src`, the cookie should be stored on the parent window domain')
        .withRum({ trackSessionAcrossSubdomains: false })
        .withHostName(FULL_HOSTNAME)
        .withSetup(bundleSetup)
        .run(async ({ page, baseUrl, browserContext, flushEvents, intakeRegistry, servers }) => {
          await injectSdkInAnIframe(page, `${servers.crossOrigin.origin}/datadog-rum.js`)
          await flushEvents()

          const cookies = await browserContext.cookies()
          expect(cookies).toEqual([
            expect.objectContaining({
              domain: FULL_HOSTNAME,
            }),
          ])
          expect(intakeRegistry.rumViewEvents.map((event) => event.view.url)).toEqual(
            expect.arrayContaining([baseUrl, 'about:blank'])
          )
        })
    })

    test.describe('trackSessionAcrossSubdomains: true', () => {
      createTest('with `trackSessionAcrossSubdomains: true`, stores the cookie on the eTLD+1')
        .withRum({ trackSessionAcrossSubdomains: true })
        .withHostName(FULL_HOSTNAME)
        .run(async ({ browserContext }) => {
          const cookies = await browserContext.cookies()
          expect(cookies).toEqual([
            expect.objectContaining({
              domain: MAIN_HOSTNAME,
            }),
          ])
        })

      createTest('when injected in a iframe without `src`, the cookie should be stored on the parent window domain')
        .withRum({ trackSessionAcrossSubdomains: true })
        .withHostName(FULL_HOSTNAME)
        .withSetup(bundleSetup)
        .run(async ({ page, baseUrl, browserContext, flushEvents, intakeRegistry, servers }) => {
          await injectSdkInAnIframe(page, `${servers.crossOrigin.origin}/datadog-rum.js`)
          await flushEvents()

          const cookies = await browserContext.cookies()
          expect(cookies).toEqual([
            expect.objectContaining({
              domain: MAIN_HOSTNAME,
            }),
          ])
          expect(intakeRegistry.rumViewEvents.map((event) => event.view.url)).toEqual(
            expect.arrayContaining([baseUrl, 'about:blank'])
          )
        })
    })

    for (const betaEncodeCookieOptions of [true, false]) {
      createTest(
        betaEncodeCookieOptions
          ? 'should not fails when RUM and LOGS are initialized with different trackSessionAcrossSubdomains values when Encode Cookie Options is enabled'
          : 'should fails when RUM and LOGS are initialized with different trackSessionAcrossSubdomains values when Encode Cookie Options is disabled'
      )
        .withRum({ trackSessionAcrossSubdomains: true, betaEncodeCookieOptions })
        .withLogs({ trackSessionAcrossSubdomains: false, betaEncodeCookieOptions })
        .withHostName(FULL_HOSTNAME)
        .run(async ({ page }) => {
          await page.waitForTimeout(1000)

          if (!betaEncodeCookieOptions) {
            // ensure the test is failing when betaEncodeCookieOptions is disabled
            test.fail()
          }

          const [rumInternalContext, logsInternalContext] = await page.evaluate(() => [
            window.DD_RUM?.getInternalContext(),
            window.DD_LOGS?.getInternalContext(),
          ])

          expect(rumInternalContext).toBeDefined()
          expect(logsInternalContext).toBeDefined()
        })

      createTest(
        betaEncodeCookieOptions
          ? 'should not fails when RUM and LOGS are initialized with different usePartitionedCrossSiteSessionCookie values when Encode Cookie Options is enabled'
          : 'should fails when RUM and LOGS are initialized with different usePartitionedCrossSiteSessionCookie values when Encode Cookie Options is disabled'
      )
        .withRum({ usePartitionedCrossSiteSessionCookie: true, betaEncodeCookieOptions })
        .withLogs({ usePartitionedCrossSiteSessionCookie: false, betaEncodeCookieOptions })
        .withHostName(FULL_HOSTNAME)
        .run(async ({ page }) => {
          await page.waitForTimeout(1000)

          if (!betaEncodeCookieOptions) {
            // ensure the test is failing when betaEncodeCookieOptions is disabled
            test.fail()
          }

          const [rumInternalContext, logsInternalContext] = await page.evaluate(() => [
            window.DD_RUM?.getInternalContext(),
            window.DD_LOGS?.getInternalContext(),
          ])

          expect(rumInternalContext).toBeDefined()
          expect(logsInternalContext).toBeDefined()
        })
    }

    async function injectSdkInAnIframe(page: Page, bundleUrl: string) {
      await page.evaluate(
        (browserSdkUrl) =>
          new Promise<void>((resolve) => {
            const iframe = document.createElement('iframe')
            document.body.appendChild(iframe)
            const iframeWindow = iframe.contentWindow!

            function onReady() {
              ;(iframeWindow as { DD_RUM: RumPublicApi }).DD_RUM.init(window.DD_RUM!.getInitConfiguration()!)
              resolve()
            }

            // This is similar to async setup, but simpler
            ;(iframeWindow as any).DD_RUM = { q: [onReady] }
            const script = iframeWindow.document.createElement('script')
            script.async = true
            script.src = browserSdkUrl
            iframeWindow.document.head.appendChild(script)
          }),
        bundleUrl
      )
    }
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

  test.describe('Memory', () => {
    createTest('uses memory to store the session')
      .withLogs({ sessionPersistence: 'memory' })
      .withRum({ sessionPersistence: 'memory' })
      .run(async ({ page }) => {
        const sessionId = await getSessionIdFromMemory(page)

        const logsContext = await page.evaluate(() => window.DD_LOGS?.getInternalContext())
        const rumContext = await page.evaluate(() => window.DD_RUM?.getInternalContext())

        expect(logsContext?.session_id).toBe(sessionId)
        expect(rumContext?.session_id).toBe(sessionId)
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

  createTest('sessionPersistence fallback')
    .withLogs({ sessionPersistence: ['local-storage', 'memory'] })
    .withRum({ sessionPersistence: ['local-storage', 'memory'] })
    .withHead(DISABLE_LOCAL_STORAGE)
    .run(async ({ page }) => {
      const sessionId = await getSessionIdFromMemory(page)

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

async function getSessionIdFromMemory(page: Page): Promise<string | undefined> {
  const sessionState = await page.evaluate(
    (key) => (window as any)[key] as { id: string } | undefined,
    MEMORY_SESSION_STORE_KEY
  )
  return sessionState?.id
}

async function getSessionIdFromCookie(browserContext: BrowserContext): Promise<string | undefined> {
  const [cookie] = await browserContext.cookies()
  return cookie.value.match(SESSION_ID_REGEX)?.[1]
}
