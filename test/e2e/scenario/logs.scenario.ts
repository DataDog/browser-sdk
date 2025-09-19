import { DEFAULT_REQUEST_ERROR_RESPONSE_LENGTH_LIMIT } from '@datadog/browser-logs/cjs/domain/configuration'
import { test, expect } from '@playwright/test'
import { createTest } from '../lib/framework'
import { APPLICATION_ID } from '../lib/helpers/configuration'

const UNREACHABLE_URL = 'http://localhost:9999/unreachable'

declare global {
  interface Window {
    myServiceWorker: ServiceWorkerRegistration
  }
}

test.describe('logs', () => {
  createTest('service worker with worker logs - esm')
    .withBody(
      `
      <script>
        // Register service worker using served URL
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.register('/sw.js', { type: 'module'})
            .then(registration => {
              console.log('Service worker registered successfully');
              window.myServiceWorker = registration;
            });
        }
      </script>
    `
    )
    .run(async ({ flushEvents, page, intakeRegistry, browserName, baseUrl }) => {
      await page.goto(baseUrl.replace(/http:\/\/[^:]+:/, 'http://localhost:'))
      test.skip(browserName === 'firefox', 'Firefox do not support ES modules in Service Workers')
      // Send a message to the service worker
      await page.evaluate(`
        window.myServiceWorker.active.postMessage("Some message");
      `)

      await flushEvents()

      expect(intakeRegistry.logsRequests).toHaveLength(1)
    })

  createTest('service worker with worker logs - importScripts')
    .withBody(
      `
      <script>
        // Register service worker using served URL
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.register('/sw-import-scripts.js')
            .then(registration => {
              console.log('Service worker registered successfully');
              window.myServiceWorker = registration;
            });
        }
      </script>
    `
    )
    .run(async ({ flushEvents, page, intakeRegistry }) => {
      // Send a message to the service worker
      await page.evaluate(`
        window.myServiceWorker.active.postMessage("Some message");
      `)

      await flushEvents()

      expect(intakeRegistry.logsRequests).toHaveLength(1)
    })

  createTest('send logs')
    .withLogs()
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      await page.evaluate(() => {
        window.DD_LOGS!.logger.log('hello')
      })
      await flushEvents()
      expect(intakeRegistry.logsEvents).toHaveLength(1)
      expect(intakeRegistry.logsEvents[0].message).toBe('hello')
    })

  createTest('display logs in the console')
    .withLogs()
    .run(async ({ intakeRegistry, flushEvents, page, withBrowserLogs }) => {
      await page.evaluate(() => {
        window.DD_LOGS!.logger.setHandler('console')
        window.DD_LOGS!.logger.warn('hello')
      })
      await flushEvents()
      expect(intakeRegistry.logsEvents).toHaveLength(0)

      withBrowserLogs((logs) => {
        expect(logs).toHaveLength(1)
        expect(logs[0].level).toBe('warning')
        expect(logs[0].message).not.toEqual(expect.stringContaining('Datadog Browser SDK'))
        expect(logs[0].message).toEqual(expect.stringContaining('hello'))
      })
    })

  createTest('send console errors')
    .withLogs({ forwardErrorsToLogs: true })
    .run(async ({ intakeRegistry, flushEvents, page, withBrowserLogs }) => {
      await page.evaluate(() => {
        console.error('oh snap')
      })
      await flushEvents()
      expect(intakeRegistry.logsEvents).toHaveLength(1)
      expect(intakeRegistry.logsEvents[0].message).toBe('oh snap')
      withBrowserLogs((browserLogs) => {
        expect(browserLogs).toHaveLength(1)
      })
    })

  createTest('send XHR network errors')
    .withLogs({ forwardErrorsToLogs: true })
    .run(async ({ intakeRegistry, flushEvents, withBrowserLogs, page }) => {
      await page.evaluate(
        (unreachableUrl) =>
          new Promise<void>((resolve) => {
            const xhr = new XMLHttpRequest()
            xhr.addEventListener('error', () => resolve())
            xhr.open('GET', unreachableUrl)
            xhr.send()
          }),
        UNREACHABLE_URL
      )

      await flushEvents()
      expect(intakeRegistry.logsEvents).toHaveLength(1)
      expect(intakeRegistry.logsEvents[0].message).toBe(`XHR error GET ${UNREACHABLE_URL}`)
      expect(intakeRegistry.logsEvents[0].origin).toBe('network')

      withBrowserLogs((browserLogs) => {
        // Some browser report two errors:
        // * failed to load resource
        // * blocked by CORS policy
        expect(browserLogs.length).toBeGreaterThanOrEqual(1)
      })
    })

  createTest('send fetch network errors')
    .withLogs({ forwardErrorsToLogs: true })
    .run(async ({ intakeRegistry, flushEvents, page, withBrowserLogs }) => {
      await page.evaluate((unreachableUrl) => fetch(unreachableUrl).catch(() => undefined), UNREACHABLE_URL)

      await flushEvents()
      expect(intakeRegistry.logsEvents).toHaveLength(1)
      expect(intakeRegistry.logsEvents[0].message).toBe(`Fetch error GET ${UNREACHABLE_URL}`)
      expect(intakeRegistry.logsEvents[0].origin).toBe('network')

      withBrowserLogs((browserLogs) => {
        // Some browser report two errors:
        // * failed to load resource
        // * blocked by CORS policy
        expect(browserLogs.length).toBeGreaterThanOrEqual(1)
      })
    })

  createTest('keep only the first bytes of the response')
    .withLogs({ forwardErrorsToLogs: true })
    .run(async ({ intakeRegistry, baseUrl, servers, flushEvents, page, withBrowserLogs, browserName }) => {
      await page.evaluate(() => fetch('/throw-large-response'))

      await flushEvents()
      expect(intakeRegistry.logsEvents).toHaveLength(1)
      expect(intakeRegistry.logsEvents[0].message).toBe(`Fetch error GET ${baseUrl}/throw-large-response`)
      expect(intakeRegistry.logsEvents[0].origin).toBe('network')

      const ellipsisSize = 3
      expect(intakeRegistry.logsEvents[0].error?.stack).toHaveLength(
        DEFAULT_REQUEST_ERROR_RESPONSE_LENGTH_LIMIT + ellipsisSize
      )

      expect(servers.base.app.getLargeResponseWroteSize()).toBeGreaterThanOrEqual(
        DEFAULT_REQUEST_ERROR_RESPONSE_LENGTH_LIMIT
      )

      withBrowserLogs((browserLogs) => {
        if (browserName === 'firefox') {
          // Firefox does not report the error message
          expect(browserLogs).toHaveLength(0)
        } else {
          expect(browserLogs).toHaveLength(1)
          expect(browserLogs[0].message).toContain('the server responded with a status of 500')
        }
      })
    })

  createTest('track fetch error')
    .withLogs({ forwardErrorsToLogs: true })
    .run(async ({ intakeRegistry, baseUrl, flushEvents, flushBrowserLogs, page }) => {
      await page.evaluate(
        (unreachableUrl) =>
          new Promise<void>((resolve) => {
            let count = 0
            fetch('/throw')
              .then(() => (count += 1))
              .catch((err) => console.error(err))
            fetch('/unknown')
              .then(() => (count += 1))
              .catch((err) => console.error(err))
            fetch(unreachableUrl).catch(() => (count += 1))
            fetch('/ok')
              .then(() => (count += 1))
              .catch((err) => console.error(err))

            const interval = setInterval(() => {
              if (count === 4) {
                clearInterval(interval)
                resolve()
              }
            }, 500)
          }),
        UNREACHABLE_URL
      )

      flushBrowserLogs()
      await flushEvents()

      expect(intakeRegistry.logsEvents).toHaveLength(2)

      const unreachableRequest = intakeRegistry.logsEvents.find((log) => log.http!.url.includes('/unreachable'))!
      const throwRequest = intakeRegistry.logsEvents.find((log) => log.http!.url.includes('/throw'))!

      expect(throwRequest.message).toEqual(`Fetch error GET ${baseUrl}/throw`)
      expect(throwRequest.http!.status_code).toEqual(500)
      expect(throwRequest.error!.stack).toMatch(/Server error/)

      expect(unreachableRequest.message).toEqual(`Fetch error GET ${UNREACHABLE_URL}`)
      expect(unreachableRequest.http!.status_code).toEqual(0)
      expect(unreachableRequest.error!.stack).toContain('TypeError')
    })

  createTest('send runtime errors happening before initialization')
    .withLogs({ forwardErrorsToLogs: true })
    .withLogsInit((configuration) => {
      // Use a setTimeout to:
      // * have a constant stack trace regardless of the setup used
      // * avoid the exception to be swallowed by the `onReady` logic
      setTimeout(() => {
        throw new Error('oh snap')
      })
      // Simulate a late initialization of the RUM SDK
      setTimeout(() => window.DD_LOGS!.init(configuration))
    })
    .run(async ({ intakeRegistry, flushEvents, withBrowserLogs }) => {
      await flushEvents()
      expect(intakeRegistry.logsEvents).toHaveLength(1)
      expect(intakeRegistry.logsEvents[0].message).toBe('oh snap')
      withBrowserLogs((browserLogs) => {
        expect(browserLogs).toHaveLength(1)
      })
    })

  createTest('add RUM internal context to logs')
    .withRum()
    .withLogs()
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      await page.evaluate(() => {
        window.DD_LOGS!.logger.log('hello')
      })
      await flushEvents()
      expect(intakeRegistry.logsEvents).toHaveLength(1)
      expect(intakeRegistry.logsEvents[0].view.id).toBeDefined()
      expect(intakeRegistry.logsEvents[0].application_id).toBe(APPLICATION_ID)
    })

  createTest('add default tags to logs')
    .withLogs({
      service: 'foo',
      env: 'dev',
      version: '1.0.0',
    })
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      await page.evaluate(() => {
        window.DD_LOGS!.logger.log('hello world!')
      })
      await flushEvents()
      expect(intakeRegistry.logsEvents).toHaveLength(1)
      expect(intakeRegistry.logsEvents[0].ddtags).toMatch(/sdk_version:(.*),env:dev,service:foo,version:1.0.0$/)
    })

  createTest('add tags to the logger')
    .withLogs()
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      await page.evaluate(() => {
        window.DD_LOGS!.logger.addTag('planet', 'mars')
        window.DD_LOGS!.logger.log('hello world!')
      })

      await flushEvents()
      expect(intakeRegistry.logsEvents).toHaveLength(1)
      expect(intakeRegistry.logsEvents[0].ddtags).toMatch(/sdk_version:(.*),planet:mars$/)
    })

  createTest('ignore tags from message context and logger context')
    .withLogs()
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      await page.evaluate(() => {
        window.DD_LOGS!.logger.setContextProperty('ddtags', 'planet:mars')
        window.DD_LOGS!.logger.log('hello world!', { ddtags: 'planet:earth' })
      })

      await flushEvents()
      expect(intakeRegistry.logsEvents).toHaveLength(1)
      expect(intakeRegistry.logsEvents[0].ddtags).toMatch(/sdk_version:(.*)$/)
    })

  createTest('allow to modify events')
    .withLogs({
      beforeSend: (event) => {
        event.foo = 'bar'
        return true
      },
    })
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      await page.evaluate(() => {
        window.DD_LOGS!.logger.log('hello', {})
      })
      await flushEvents()
      expect(intakeRegistry.logsEvents).toHaveLength(1)
      expect(intakeRegistry.logsEvents[0].foo).toBe('bar')
    })
})
