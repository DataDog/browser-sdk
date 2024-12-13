import { SESSION_STORE_KEY } from '@datadog/browser-core'
import { createTest } from '../lib/framework'

describe('Session Stores', () => {
  describe('Cookies', () => {
    createTest('Cookie Initialization')
      .withLogs()
      .withRum()
      .run(async () => {
        const [cookie] = await browser.getCookies([SESSION_STORE_KEY])
        const cookieSessionId = cookie.value.match(/&id=([\w-]+)/)![1]

        const logsContext = await browser.execute(() => window.DD_LOGS?.getInternalContext())
        const rumContext = await browser.execute(() => window.DD_RUM?.getInternalContext())

        expect(logsContext?.session_id).toBe(cookieSessionId)
        expect(rumContext?.session_id).toBe(cookieSessionId)
      })
  })

  describe('Local Storage', () => {
    createTest('Local Storage Initialization')
      .withLogs({ allowFallbackToLocalStorage: true })
      .withRum({ allowFallbackToLocalStorage: true })
      // This will force the SDKs to initialize using local storage
      .withHead('<script>Object.defineProperty(Document.prototype, "cookie", { get: () => 42})</script>')
      .run(async () => {
        const sessionStateString = await browser.execute((key) => window.localStorage.getItem(key), SESSION_STORE_KEY)
        const sessionId = sessionStateString?.match(/&id=([\w-]+)/)![1]

        const logsContext = await browser.execute(() => window.DD_LOGS?.getInternalContext())
        const rumContext = await browser.execute(() => window.DD_RUM?.getInternalContext())

        expect(logsContext?.session_id).toBe(sessionId)
        expect(rumContext?.session_id).toBe(sessionId)
      })
  })

  describe('No storage available', () => {
    createTest('RUM should fail init / Logs should succeed')
      .withLogs({ allowFallbackToLocalStorage: true })
      .withRum({ allowFallbackToLocalStorage: true })
      // This will ensure no storage is available
      .withHead(
        `
        <script>
          Object.defineProperty(Document.prototype, "cookie", { get: () => 42});
          Object.defineProperty(Storage.prototype, "getItem", { get: () => 42});
        </script>`
      )
      .run(async () => {
        const logsContext = await browser.execute(() => window.DD_LOGS?.getInternalContext())
        const rumContext = await browser.execute(() => window.DD_RUM?.getInternalContext())

        expect(logsContext).not.toBeNull()
        expect(rumContext).toBeNull()
      })
  })
})
