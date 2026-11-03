import { test, expect } from '@playwright/test'
import { createTest, html } from '../lib/framework'

// Over the 225,280 characters serialization limit, so serializing it displays a truncation warning
function logLargeObject() {
  console.debug('large object', { data: 'a'.repeat(300 * 1024) })
}

test.describe('console instrumentation', () => {
  // Logs is also initialized, as the npm test app always loads it, and Logs instruments every
  // console API until init()
  createTest('RUM and Logs do not serialize console calls they do not collect')
    .withRum()
    .withLogs()
    .run(async ({ page, withBrowserLogs }) => {
      await page.evaluate(logLargeObject)

      withBrowserLogs((browserLogs) => {
        expect(browserLogs.map(({ level }) => level)).toEqual(['debug'])
      })
    })

  createTest('Logs does not serialize console calls it does not forward')
    .withLogs({ forwardConsoleLogs: ['error'] })
    .run(async ({ page, withBrowserLogs }) => {
      await page.evaluate(logLargeObject)

      withBrowserLogs((browserLogs) => {
        expect(browserLogs.map(({ level }) => level)).toEqual(['debug'])
      })
    })

  createTest('RUM collects console errors when Logs stops instrumenting console.error after RUM is loaded')
    .withRum()
    .withLogs()
    .withLogsInit((configuration) => {
      // Logs loads first and RUM instruments console.error on top of it. Initializing Logs on load
      // makes Logs stop its own instrumentation while RUM's instrumentation sits above it.
      window.addEventListener('load', () => window.DD_LOGS!.init(configuration))
    })
    .withBody(html`
      <button>click me</button>
      <script>
        document.querySelector('button').addEventListener('click', function handler() {
          console.error('oh snap')
        })
      </script>
    `)
    .run(async ({ page, intakeRegistry, flushEvents, withBrowserLogs }) => {
      expect(await page.evaluate(() => !!window.DD_LOGS!.getInitConfiguration())).toBe(true)

      await page.locator('button').click()

      await flushEvents()
      expect(intakeRegistry.rumErrorEvents).toHaveLength(1)
      expect(intakeRegistry.rumErrorEvents[0].error).toEqual(
        expect.objectContaining({
          message: 'oh snap',
          source: 'console',
          handling_stack: expect.stringContaining('HandlingStack: console error'),
        })
      )
      expect(intakeRegistry.logsEvents).toHaveLength(0)
      withBrowserLogs((browserLogs) => {
        expect(browserLogs).toHaveLength(1)
      })
    })
})
