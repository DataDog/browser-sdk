import { DEFAULT_REQUEST_ERROR_RESPONSE_LENGTH_LIMIT } from '@datadog/browser-logs/cjs/domain/configuration'
import { createTest, flushEvents } from '../lib/framework'
import { UNREACHABLE_URL } from '../lib/helpers/constants'
import { browserExecute, browserExecuteAsync, flushBrowserLogs, withBrowserLogs } from '../lib/helpers/browser'

describe('logs', () => {
  createTest('send logs')
    .withLogs()
    .run(async ({ serverEvents }) => {
      await browserExecute(() => {
        window.DD_LOGS!.logger.log('hello')
      })
      await flushEvents()
      expect(serverEvents.logs.length).toBe(1)
      expect(serverEvents.logs[0].message).toBe('hello')
    })

  createTest('send console errors')
    .withLogs({ forwardErrorsToLogs: true })
    .run(async ({ serverEvents }) => {
      await browserExecute(() => {
        console.error('oh snap')
      })
      await flushEvents()
      expect(serverEvents.logs.length).toBe(1)
      expect(serverEvents.logs[0].message).toBe('console error: oh snap')
      await withBrowserLogs((browserLogs) => {
        expect(browserLogs.length).toEqual(1)
      })
    })

  createTest('send XHR network errors')
    .withLogs({ forwardErrorsToLogs: true })
    .run(async ({ serverEvents }) => {
      await browserExecuteAsync((unreachableUrl, done) => {
        const xhr = new XMLHttpRequest()
        xhr.addEventListener('error', () => done(undefined))
        xhr.open('GET', unreachableUrl)
        xhr.send()
      }, UNREACHABLE_URL)

      await flushEvents()
      expect(serverEvents.logs.length).toBe(1)
      expect(serverEvents.logs[0].message).toBe(`XHR error GET ${UNREACHABLE_URL}`)
      expect(serverEvents.logs[0].error?.origin).toBe('network')

      await withBrowserLogs((browserLogs) => {
        // Some browser report two errors:
        // * failed to load resource
        // * blocked by CORS policy
        expect(browserLogs.length).toBeGreaterThanOrEqual(1)
      })
    })

  createTest('send fetch network errors')
    .withLogs({ forwardErrorsToLogs: true })
    .run(async ({ serverEvents }) => {
      await browserExecuteAsync((unreachableUrl, done) => {
        fetch(unreachableUrl).catch(() => {
          done(undefined)
        })
      }, UNREACHABLE_URL)

      await flushEvents()
      expect(serverEvents.logs.length).toBe(1)
      expect(serverEvents.logs[0].message).toBe(`Fetch error GET ${UNREACHABLE_URL}`)
      expect(serverEvents.logs[0].error?.origin).toBe('network')

      await withBrowserLogs((browserLogs) => {
        // Some browser report two errors:
        // * failed to load resource
        // * blocked by CORS policy
        expect(browserLogs.length).toBeGreaterThanOrEqual(1)
      })
    })

  createTest('read only the first bytes of the response')
    .withLogs({ forwardErrorsToLogs: true })
    .run(async ({ serverEvents, baseUrl, servers }) => {
      await browserExecuteAsync((done) => {
        const controller = new AbortController()
        const signal = controller.signal

        setTimeout(() => {
          controller.abort()
          setTimeout(() => done(undefined), 1000)
        }, 2000)

        fetch('/throw-large-response', { signal }).then((_) => ({}), console.log)
      })

      await flushEvents()
      expect(serverEvents.logs.length).toBe(1)
      expect(serverEvents.logs[0].message).toBe(`Fetch error GET ${baseUrl}/throw-large-response`)
      expect(serverEvents.logs[0].error?.origin).toBe('network')

      const ellipsisSize = 3
      expect(serverEvents.logs[0].error?.stack?.length).toBe(DEFAULT_REQUEST_ERROR_RESPONSE_LENGTH_LIMIT + ellipsisSize)

      expect(servers.base.app.getLargeResponseWroteSize()).toBeLessThan(
        // When reading the request, chunks length are probably not aligning perfectly with the
        // response length limit, so it sends few more bytes than necessary. Add a margin of error
        // to verify that it's still close to the expected limit.
        DEFAULT_REQUEST_ERROR_RESPONSE_LENGTH_LIMIT * 4
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
    .run(async ({ serverEvents, baseUrl }) => {
      await browserExecuteAsync((unreachableUrl, done) => {
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

      expect(serverEvents.logs.length).toEqual(2)

      const unreachableRequest = serverEvents.logs.find((log) => log.http!.url.includes('/unreachable'))!
      const throwRequest = serverEvents.logs.find((log) => log.http!.url.includes('/throw'))!

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
    .run(async ({ serverEvents }) => {
      await browserExecute(() => {
        window.DD_LOGS!.logger.log('hello')
      })
      await flushEvents()
      expect(serverEvents.logs.length).toBe(1)
      expect(serverEvents.logs[0].view.id).toBeDefined()
      expect(serverEvents.logs[0].application_id).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
    })

  createTest('allow to modify events')
    .withLogs({
      beforeSend(event) {
        event.foo = 'bar'
      },
    })
    .run(async ({ serverEvents }) => {
      await browserExecute(() => {
        window.DD_LOGS!.logger.log('hello', {})
      })
      await flushEvents()
      expect(serverEvents.logs.length).toBe(1)
      expect(serverEvents.logs[0].foo).toBe('bar')
    })
})
