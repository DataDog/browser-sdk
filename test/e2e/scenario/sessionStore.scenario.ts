import { SESSION_STORE_KEY } from '@datadog/browser-core'
import { createTest } from '../lib/framework'

const DISABLE_LOCAL_STORAGE = '<script>Object.defineProperty(Storage.prototype, "getItem", { get: () => 42});</script>'
const DISABLE_COOKIES = '<script>Object.defineProperty(Document.prototype, "cookie", { get: () => 42});</script>'
const SESSION_ID_REGEX = /(?<!a)id=([\w-]+)/ // match `id` but not `aid`

describe('Session Stores', () => {
  describe('Cookies', () => {
    createTest('uses cookies to store the session')
      .withLogs()
      .withRum()
      .run(async () => {
        const cookieSessionId = await getSessionIdFromCookie()

        const logsContext = await browser.execute(() => window.DD_LOGS?.getInternalContext())
        const rumContext = await browser.execute(() => window.DD_RUM?.getInternalContext())

        expect(logsContext?.session_id).toBe(cookieSessionId)
        expect(rumContext?.session_id).toBe(cookieSessionId)
      })

    createTest('when cookies are unavailable, Logs should start, but not RUM')
      .withLogs()
      .withRum()
      .withHead(DISABLE_COOKIES)
      .run(async () => {
        const logsContext = await browser.execute(() => window.DD_LOGS?.getInternalContext())
        const rumContext = await browser.execute(() => window.DD_RUM?.getInternalContext())

        expect(logsContext).toBeDefined()
        expect(rumContext).not.toBeDefined()
      })
  })

  describe('Local Storage', () => {
    createTest('uses localStorage to store the session')
      .withLogs({ sessionPersistence: 'local-storage' })
      .withRum({ sessionPersistence: 'local-storage' })
      .run(async () => {
        const sessionId = await getSessionIdFromLocalStorage()

        const logsContext = await browser.execute(() => window.DD_LOGS?.getInternalContext())
        const rumContext = await browser.execute(() => window.DD_RUM?.getInternalContext())

        expect(logsContext?.session_id).toBe(sessionId)
        expect(rumContext?.session_id).toBe(sessionId)
      })

    createTest('when localStorage is unavailable, Logs should start, but not RUM')
      .withLogs({ sessionPersistence: 'local-storage' })
      .withRum({ sessionPersistence: 'local-storage' })
      .withHead(DISABLE_LOCAL_STORAGE)
      .run(async () => {
        const logsContext = await browser.execute(() => window.DD_LOGS?.getInternalContext())
        const rumContext = await browser.execute(() => window.DD_RUM?.getInternalContext())

        expect(logsContext).not.toBeNull()
        expect(rumContext).toBeNull()
      })
  })

  createTest('allowFallbackToLocalStorage (deprecated)')
    .withLogs({ allowFallbackToLocalStorage: true })
    .withRum({ allowFallbackToLocalStorage: true })
    .withHead(DISABLE_COOKIES)
    .run(async () => {
      const sessionId = await getSessionIdFromLocalStorage()

      const logsContext = await browser.execute(() => window.DD_LOGS?.getInternalContext())
      const rumContext = await browser.execute(() => window.DD_RUM?.getInternalContext())

      expect(logsContext?.session_id).toBe(sessionId)
      expect(rumContext?.session_id).toBe(sessionId)
    })
})

async function getSessionIdFromLocalStorage(): Promise<string | undefined> {
  const sessionStateString = await browser.execute((key) => window.localStorage.getItem(key), SESSION_STORE_KEY)
  return sessionStateString?.match(SESSION_ID_REGEX)?.[1]
}

async function getSessionIdFromCookie(): Promise<string | undefined> {
  const [cookie] = await browser.getCookies({ name: SESSION_STORE_KEY })
  return cookie.value.match(SESSION_ID_REGEX)?.[1]
}
