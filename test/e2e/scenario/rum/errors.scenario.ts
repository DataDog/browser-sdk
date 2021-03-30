import { createTest, bundleSetup } from '../../lib/framework'
import { browserExecute, browserExecuteAsync, withBrowserLogs } from '../../lib/helpers/browser'
import { flushEvents } from '../../lib/helpers/sdk'

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
    .run(async ({ events, baseUrl }) => {
      await browserExecuteAsync((done) => {
        const xhr = new XMLHttpRequest()
        xhr.addEventListener('error', () => done(undefined))
        xhr.open('GET', '/network-error')
        xhr.send()
      })

      await flushEvents()
      expect(events.rumErrors.length).toBe(1)
      expect(events.rumErrors[0].error.message).toBe(`XHR error GET ${baseUrl}/network-error`)
      expect(events.rumErrors[0].error.source).toBe('network')

      const resourceEvent = events.rumResources.find((event) => event.resource.type === 'xhr')
      expect(resourceEvent).toBeTruthy()
      expect(resourceEvent?.resource.status_code).toBe(0)

      await withBrowserLogs((browserLogs) => {
        expect(browserLogs.length).toEqual(1)
      })
    })

  createTest('send fetch network errors')
    .withRum()
    .withSetup(bundleSetup)
    .run(async ({ events, baseUrl }) => {
      await browserExecuteAsync((done) => {
        fetch('/network-error').catch(() => {
          done(undefined)
        })
      })

      await flushEvents()
      expect(events.rumErrors.length).toBe(1)
      expect(events.rumErrors[0].error.message).toBe(`Fetch error GET ${baseUrl}/network-error`)
      expect(events.rumErrors[0].error.source).toBe('network')

      const resourceEvent = events.rumResources.find((event) => event.resource.type === 'fetch')
      expect(resourceEvent).toBeTruthy()
      expect(resourceEvent?.resource.status_code).toBe(0)

      await withBrowserLogs((browserLogs) => {
        expect(browserLogs.length).toEqual(1)
      })
    })
})
