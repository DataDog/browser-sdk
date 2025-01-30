import { DEFAULT_REQUEST_ERROR_RESPONSE_LENGTH_LIMIT } from '@datadog/browser-logs/cjs/domain/configuration'
import { test, expect } from '@playwright/test'
import { createTest } from '../lib/framework'
import { APPLICATION_ID } from '../lib/helpers/configuration'

const UNREACHABLE_URL = 'http://localhost:9999/unreachable'

test.describe('logs', () => {
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
        expect(browserLogs.length).toEqual(1)
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
        if (browserName.includes('firefox')) {
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

      expect(intakeRegistry.logsEvents.length).toEqual(2)

      const unreachableRequest = intakeRegistry.logsEvents.find((log) => log.http!.url.includes('/unreachable'))!
      const throwRequest = intakeRegistry.logsEvents.find((log) => log.http!.url.includes('/throw'))!

      expect(throwRequest.message).toEqual(`Fetch error GET ${baseUrl}/throw`)
      expect(throwRequest.http!.status_code).toEqual(500)
      expect(throwRequest.error!.stack).toMatch(/Server error/)

      expect(unreachableRequest.message).toEqual(`Fetch error GET ${UNREACHABLE_URL}`)
      expect(unreachableRequest.http!.status_code).toEqual(0)
      expect(unreachableRequest.error!.stack).toContain('TypeError')
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
