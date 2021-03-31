import { createTest, bundleSetup } from '../../lib/framework'
import { browserExecute, browserExecuteAsync, withBrowserLogs } from '../../lib/helpers/browser'
import { flushEvents } from '../../lib/helpers/sdk'
import { UNREACHABLE_URL } from '../../lib/helpers/constants'

describe('rum errors', () => {
  createTest('send console.error errors')
    .withRum()
    .run(async ({ events }) => {
      await browserExecute(() => {
        console.error('oh snap')
      })
      await flushEvents()
      expect(events.rumErrors.length).toBe(1)
      expect(events.rumErrors[0].error.message).toBe('console error: oh snap')
      expect(events.rumErrors[0].error.source).toBe('console')
      await withBrowserLogs((browserLogs) => {
        expect(browserLogs.length).toEqual(1)
      })
    })

  createTest('send XHR network errors')
    .withRum()
    .withSetup(bundleSetup)
    .run(async ({ events }) => {
      await browserExecuteAsync((unreachableUrl, done) => {
        const xhr = new XMLHttpRequest()
        xhr.addEventListener('error', () => done(undefined))
        xhr.open('GET', unreachableUrl)
        xhr.send()
      }, UNREACHABLE_URL)

      await flushEvents()
      expect(events.rumErrors.length).toBe(1)
      expect(events.rumErrors[0].error.message).toBe(`XHR error GET ${UNREACHABLE_URL}`)
      expect(events.rumErrors[0].error.source).toBe('network')

      const resourceEvent = events.rumResources.find((event) => event.resource.type === 'xhr')
      expect(resourceEvent).toBeTruthy()
      expect(resourceEvent?.resource.status_code).toBe(0)

      await withBrowserLogs((browserLogs) => {
        // Some browser report two errors:
        // * failed to load resource
        // * blocked by CORS policy
        expect(browserLogs.length).toBeGreaterThanOrEqual(1)
      })
    })

  createTest('send fetch network errors')
    .withRum()
    .withSetup(bundleSetup)
    .run(async ({ events }) => {
      await browserExecuteAsync((unreachableUrl, done) => {
        fetch(unreachableUrl).catch(() => {
          done(undefined)
        })
      }, UNREACHABLE_URL)

      await flushEvents()
      expect(events.rumErrors.length).toBe(1)
      expect(events.rumErrors[0].error.message).toBe(`Fetch error GET ${UNREACHABLE_URL}`)
      expect(events.rumErrors[0].error.source).toBe('network')

      const resourceEvent = events.rumResources.find((event) => event.resource.type === 'fetch')
      expect(resourceEvent).toBeTruthy()
      expect(resourceEvent?.resource.status_code).toBe(0)

      await withBrowserLogs((browserLogs) => {
        // Some browser report two errors:
        // * failed to load resource
        // * blocked by CORS policy
        expect(browserLogs.length).toBeGreaterThanOrEqual(1)
      })
    })
})
