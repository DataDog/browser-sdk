import { createTest, html } from '../../lib/framework'
import { sendXhr } from '../../lib/helpers/browser'
import { flushEvents } from '../../lib/helpers/sdk'
import { ServerRumResourceEvent } from '../../lib/types/serverEvents'

const REQUEST_DURATION = 200

describe('rum resources', () => {
  createTest('track xhr timings')
    .withRum()
    .run(async ({ events }) => {
      await sendXhr(`/ok?duration=${REQUEST_DURATION}`)
      await flushEvents()
      const resourceEvent = events.rumResources.find((r) => r.http.url.includes('/ok'))!
      expect(resourceEvent).toBeDefined()
      expect(resourceEvent.http.method).toBe('GET')
      expect(resourceEvent.http.status_code).toBe(200)
      expectToHaveValidTimings(resourceEvent)
    })

  createTest('track redirect xhr timings')
    .withRum()
    .run(async ({ events }) => {
      await sendXhr(`/redirect?duration=${REQUEST_DURATION}`)
      await flushEvents()
      const resourceEvent = events.rumResources.find((r) => r.http.url.includes('/redirect'))!
      expect(resourceEvent).not.toBeUndefined()
      expect(resourceEvent.http.method).toEqual('GET')
      expect(resourceEvent.http.status_code).toEqual(200)
      expectToHaveValidTimings(resourceEvent)
      expect(resourceEvent.http.performance!.redirect).not.toBeUndefined()
      expect(resourceEvent.http.performance!.redirect!.duration).toBeGreaterThan(0)
    })

  createTest("don't track disallowed cross origin xhr timings")
    .withRum()
    .run(async ({ crossOriginUrl, events }) => {
      await sendXhr(`${crossOriginUrl}/ok?duration=${REQUEST_DURATION}`)
      await flushEvents()
      const resourceEvent = events.rumResources.find((r) => r.http.url.includes('/ok'))!
      expect(resourceEvent).toBeDefined()
      expect(resourceEvent.http.method).toEqual('GET')
      expect(resourceEvent.http.status_code).toEqual(200)
      expect(resourceEvent.duration).toBeGreaterThan(0)
      expect(resourceEvent.http.performance).toBeUndefined()
    })

  createTest('track allowed cross origin xhr timings')
    .withRum()
    .run(async ({ crossOriginUrl, events }) => {
      await sendXhr(`${crossOriginUrl}/ok?timing-allow-origin=true&duration=${REQUEST_DURATION}`)
      await flushEvents()
      const resourceEvent = events.rumResources.find((r) => r.http.url.includes('/ok'))!
      expect(resourceEvent).not.toBeUndefined()
      expect(resourceEvent.http.method).toEqual('GET')
      expect(resourceEvent.http.status_code).toEqual(200)
      expectToHaveValidTimings(resourceEvent)
    })

  createTest('retrieve early requests timings')
    .withRum()
    .withHead(
      html`
        <link rel="stylesheet" href="/empty.css" />
      `
    )
    .run(async ({ events }) => {
      await flushEvents()
      const resourceEvent = events.rumResources.find((event) => event.http.url.includes('empty.css'))
      expect(resourceEvent).toBeDefined()
      expectToHaveValidTimings(resourceEvent!)
    })

  createTest('retrieve initial document timings')
    .withRum()
    .run(async ({ baseUrl, events }) => {
      await flushEvents()
      const resourceEvent = events.rumResources.find((event) => event.resource.kind === 'document')
      expect(resourceEvent).toBeDefined()
      expect(resourceEvent!.http.url).toBe(`${baseUrl}/`)
      expectToHaveValidTimings(resourceEvent!)
    })
})

function expectToHaveValidTimings(resourceEvent: ServerRumResourceEvent) {
  expect(resourceEvent.date).toBeGreaterThan(0)
  expect(resourceEvent.duration).toBeGreaterThan(0)
  const performance = resourceEvent.http.performance
  // timing could have been discarded by the SDK if there was not in the correct order
  if (performance) {
    expect(performance.download.start).toBeGreaterThan(0)
  }
}
