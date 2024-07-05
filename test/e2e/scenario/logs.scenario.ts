import { DEFAULT_REQUEST_ERROR_RESPONSE_LENGTH_LIMIT } from '@datadog/browser-logs/cjs/domain/configuration'
import { createTest, flushEvents } from '../lib/framework'
import { APPLICATION_ID } from '../lib/helpers/configuration'
import { flushBrowserLogs, withBrowserLogs } from '../lib/helpers/browser'

const UNREACHABLE_URL = 'http://localhost:9999/unreachable'

describe('logs', () => {
  createTest('send logs')
    .withLogs()
    .run(async ({ intakeRegistry }) => {
      await browser.execute(() => {
        window.DD_LOGS!.logger.log('hello')
      })
      await flushEvents()
      expect(intakeRegistry.logsEvents.length).toBe(1)
      expect(intakeRegistry.logsEvents[0].message).toBe('hello')
    })

  createTest('display logs in the console')
    .withLogs()
    .run(async ({ intakeRegistry }) => {
      await browser.execute(() => {
        window.DD_LOGS!.logger.setHandler('console')
        window.DD_LOGS!.logger.warn('hello')
      })
      await flushEvents()
      expect(intakeRegistry.logsEvents.length).toBe(0)

      await withBrowserLogs((logs) => {
        expect(logs.length).toBe(1)
        expect(logs[0].level).toBe('WARNING')
        expect(logs[0].message).not.toEqual(jasmine.stringContaining('Datadog Browser SDK'))
        expect(logs[0].message).toEqual(jasmine.stringContaining('hello'))
      })
    })

  createTest('send console errors')
    .withLogs({ forwardErrorsToLogs: true })
    .run(async ({ intakeRegistry }) => {
      await browser.execute(() => {
        console.error('oh snap')
      })
      await flushEvents()
      expect(intakeRegistry.logsEvents.length).toBe(1)
      expect(intakeRegistry.logsEvents[0].message).toBe('oh snap')
      await withBrowserLogs((browserLogs) => {
        expect(browserLogs.length).toEqual(1)
      })
    })

  createTest('send XHR network errors')
    .withLogs({ forwardErrorsToLogs: true })
    .run(async ({ intakeRegistry }) => {
      await browser.executeAsync((unreachableUrl, done) => {
        const xhr = new XMLHttpRequest()
        xhr.addEventListener('error', () => done(undefined))
        xhr.open('GET', unreachableUrl)
        xhr.send()
      }, UNREACHABLE_URL)

      await flushEvents()
      expect(intakeRegistry.logsEvents.length).toBe(1)
      expect(intakeRegistry.logsEvents[0].message).toBe(`XHR error GET ${UNREACHABLE_URL}`)
      expect(intakeRegistry.logsEvents[0].origin).toBe('network')

      await withBrowserLogs((browserLogs) => {
        // Some browser report two errors:
        // * failed to load resource
        // * blocked by CORS policy
        expect(browserLogs.length).toBeGreaterThanOrEqual(1)
      })
    })

  createTest('send fetch network errors')
    .withLogs({ forwardErrorsToLogs: true })
    .run(async ({ intakeRegistry }) => {
      await browser.executeAsync((unreachableUrl, done) => {
        fetch(unreachableUrl).catch(() => {
          done(undefined)
        })
      }, UNREACHABLE_URL)

      await flushEvents()
      expect(intakeRegistry.logsEvents.length).toBe(1)
      expect(intakeRegistry.logsEvents[0].message).toBe(`Fetch error GET ${UNREACHABLE_URL}`)
      expect(intakeRegistry.logsEvents[0].origin).toBe('network')

      await withBrowserLogs((browserLogs) => {
        // Some browser report two errors:
        // * failed to load resource
        // * blocked by CORS policy
        expect(browserLogs.length).toBeGreaterThanOrEqual(1)
      })
    })

  createTest('keep only the first bytes of the response')
    .withLogs({ forwardErrorsToLogs: true })
    .run(async ({ intakeRegistry, baseUrl, servers }) => {
      await browser.executeAsync((done) => {
        fetch('/throw-large-response').then(() => done(undefined), console.log)
      })

      await flushEvents()
      expect(intakeRegistry.logsEvents.length).toBe(1)
      expect(intakeRegistry.logsEvents[0].message).toBe(`Fetch error GET ${baseUrl}/throw-large-response`)
      expect(intakeRegistry.logsEvents[0].origin).toBe('network')

      const ellipsisSize = 3
      expect(intakeRegistry.logsEvents[0].error?.stack?.length).toBe(
        DEFAULT_REQUEST_ERROR_RESPONSE_LENGTH_LIMIT + ellipsisSize
      )

      expect(servers.base.app.getLargeResponseWroteSize()).toBeGreaterThanOrEqual(
        DEFAULT_REQUEST_ERROR_RESPONSE_LENGTH_LIMIT
      )

      await withBrowserLogs((browserLogs) => {
        // Some browser report two errors:
        // * the server responded with a status of 500
        // * canceling the body stream is reported as a network error (net::ERR_FAILED)
        expect(browserLogs.length).toBeGreaterThanOrEqual(1)
      })
    })

  createTest('track fetch error')
    .withLogs({ forwardErrorsToLogs: true })
    .run(async ({ intakeRegistry, baseUrl }) => {
      await browser.executeAsync((unreachableUrl, done) => {
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
            done(undefined)
          }
        }, 500)
      }, UNREACHABLE_URL)

      await flushBrowserLogs()
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
    .run(async ({ intakeRegistry }) => {
      await browser.execute(() => {
        window.DD_LOGS!.logger.log('hello')
      })
      await flushEvents()
      expect(intakeRegistry.logsEvents.length).toBe(1)
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
    .run(async ({ intakeRegistry }) => {
      await browser.execute(() => {
        window.DD_LOGS!.logger.log('hello', {})
      })
      await flushEvents()
      expect(intakeRegistry.logsEvents.length).toBe(1)
      expect(intakeRegistry.logsEvents[0].foo).toBe('bar')
    })
})
