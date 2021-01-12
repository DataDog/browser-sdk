import { createTest } from '../lib/framework'
import { browserExecute, browserExecuteAsync, flushBrowserLogs, withBrowserLogs } from '../lib/helpers/browser'
import { flushEvents } from '../lib/helpers/sdk'

const UNREACHABLE_URL = 'http://localhost:9999/unreachable'

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

  createTest('send errors')
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

  createTest('track fetch error')
    .withLogs({ forwardErrorsToLogs: true })
    .run(async ({ events, baseUrl }) => {
      await browserExecuteAsync((unreachableUrl, done) => {
        let count = 0
        fetch(`/throw`).then(() => (count += 1))
        fetch(`/unknown`).then(() => (count += 1))
        fetch(unreachableUrl).catch(() => (count += 1))
        fetch(`/ok`).then(() => (count += 1))

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
})
