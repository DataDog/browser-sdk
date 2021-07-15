import { createTest } from '../lib/framework'
import { UNREACHABLE_URL } from '../lib/helpers/constants'
import { browserExecute, browserExecuteAsync, flushBrowserLogs, withBrowserLogs } from '../lib/helpers/browser'
import { flushEvents } from '../lib/helpers/sdk'

describe('logs', () => {
  createTest('send logs')
    .withLogs()
    .run(async ({ events }) => {
      await browserExecute(() => {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        window.DD_LOGS!.logger.log('hello')
      })
      await flushEvents()
      expect(events.logs.length).toBe(1)
      expect(events.logs[0].message).toBe('hello')
    })

  createTest('send console errors')
    .withLogs({ forwardErrorsToLogs: true })
    .run(async ({ events }) => {
      await browserExecute(() => {
        console.error('oh snap')
      })
      await flushEvents()
      expect(events.logs.length).toBe(1)
      expect(events.logs[0].message).toBe('console error: oh snap')
      await withBrowserLogs((browserLogs) => {
        expect(browserLogs.length).toEqual(1)
      })
    })

  createTest('send XHR network errors')
    .withLogs({ forwardErrorsToLogs: true })
    .run(async ({ events }) => {
      await browserExecuteAsync((unreachableUrl, done) => {
        const xhr = new XMLHttpRequest()
        xhr.addEventListener('error', () => done(undefined))
        xhr.open('GET', unreachableUrl)
        xhr.send()
      }, UNREACHABLE_URL)

      await flushEvents()
      expect(events.logs.length).toBe(1)
      expect(events.logs[0].message).toBe(`XHR error GET ${UNREACHABLE_URL}`)
      expect(events.logs[0].error?.origin).toBe('network')

      await withBrowserLogs((browserLogs) => {
        // Some browser report two errors:
        // * failed to load resource
        // * blocked by CORS policy
        expect(browserLogs.length).toBeGreaterThanOrEqual(1)
      })
    })

  createTest('send fetch network errors')
    .withLogs({ forwardErrorsToLogs: true })
    .run(async ({ events }) => {
      await browserExecuteAsync((unreachableUrl, done) => {
        fetch(unreachableUrl).catch(() => {
          done(undefined)
        })
      }, UNREACHABLE_URL)

      await flushEvents()
      expect(events.logs.length).toBe(1)
      expect(events.logs[0].message).toBe(`Fetch error GET ${UNREACHABLE_URL}`)
      expect(events.logs[0].error?.origin).toBe('network')

      await withBrowserLogs((browserLogs) => {
        // Some browser report two errors:
        // * failed to load resource
        // * blocked by CORS policy
        expect(browserLogs.length).toBeGreaterThanOrEqual(1)
      })
    })

  createTest('track fetch error')
    .withLogs({ forwardErrorsToLogs: true })
    .run(async ({ events, baseUrl }) => {
      await browserExecuteAsync((unreachableUrl, done) => {
        let count = 0
        fetch(`/throw`)
          .then(() => (count += 1))
          .catch((err) => console.error(err))
        fetch(`/unknown`)
          .then(() => (count += 1))
          .catch((err) => console.error(err))
        fetch(unreachableUrl).catch(() => (count += 1))
        fetch(`/ok`)
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

      expect(events.logs.length).toEqual(2)

      const unreachableRequest = events.logs.find((log) => log.http.url.includes('/unreachable'))!
      const throwRequest = events.logs.find((log) => log.http.url.includes('/throw'))!

      expect(throwRequest.message).toEqual(`Fetch error GET ${baseUrl}/throw`)
      expect(throwRequest.http.status_code).toEqual(500)
      expect(throwRequest.error!.stack).toMatch(/Server error/)

      expect(unreachableRequest.message).toEqual(`Fetch error GET ${UNREACHABLE_URL}`)
      expect(unreachableRequest.http.status_code).toEqual(0)
      expect(unreachableRequest.error!.stack).toContain('TypeError')
    })

  createTest('add RUM internal context to logs')
    .withRum()
    .withLogs()
    .run(async ({ events }) => {
      await browserExecute(() => {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        window.DD_LOGS!.logger.log('hello')
      })
      await flushEvents()
      expect(events.logs.length).toBe(1)
      expect(events.logs[0].view.id).toBeDefined()
      expect(events.logs[0].application_id).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
    })

  createTest('allow to modify events')
    .withLogs({
      beforeSend(event) {
        event.foo = 'bar'
      },
    })
    .run(async ({ events }) => {
      await browserExecute(() => {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        window.DD_LOGS!.logger.log('hello', {})
      })
      await flushEvents()
      expect(events.logs.length).toBe(1)
      expect(events.logs[0].foo).toBe('bar')
    })
})
