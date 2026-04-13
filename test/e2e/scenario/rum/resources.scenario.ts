import { test, expect } from '@playwright/test'
import type { RumResourceEvent } from '@datadog/browser-rum'
import { isContentTypeAvailableInPerformanceEntry } from 'test/e2e/lib/helpers/browser'
import type { IntakeRegistry } from '../../lib/framework'
import { createTest, html } from '../../lib/framework'

const REQUEST_DURATION = 200

test.describe('rum resources', () => {
  createTest('track xhr timings')
    .withRum()
    .run(async ({ intakeRegistry, flushEvents, sendXhr }) => {
      await sendXhr(`/ok?duration=${REQUEST_DURATION}`)
      await flushEvents()
      const resourceEvent = intakeRegistry.rumResourceEvents.find((r) => r.resource.url.includes('/ok'))!
      expect(resourceEvent).toBeDefined()
      expect(resourceEvent.resource.method).toBe('GET')
      expect(resourceEvent.resource.status_code).toBe(200)
      expectToHaveValidTimings(resourceEvent)
    })

  createTest('track redirect xhr timings')
    .withRum()
    .run(async ({ intakeRegistry, flushEvents, sendXhr }) => {
      await sendXhr(`/redirect?duration=${REQUEST_DURATION}`)
      await flushEvents()
      const resourceEvent = intakeRegistry.rumResourceEvents.find((r) => r.resource.url.includes('/redirect'))!
      expect(resourceEvent).not.toBeUndefined()
      expect(resourceEvent.resource.method).toEqual('GET')
      expect(resourceEvent.resource.status_code).toEqual(200)
      expectToHaveValidTimings(resourceEvent)
      expect(resourceEvent.resource.redirect).not.toBeUndefined()
      expect(resourceEvent.resource.redirect!.duration).toBeGreaterThan(0)
    })

  createTest("don't track disallowed cross origin xhr timings")
    .withRum()
    .run(async ({ servers, intakeRegistry, flushEvents, sendXhr }) => {
      await sendXhr(`${servers.crossOrigin.origin}/ok?duration=${REQUEST_DURATION}`)
      await flushEvents()
      const resourceEvent = intakeRegistry.rumResourceEvents.find((r) => r.resource.url.includes('/ok'))!
      expect(resourceEvent).toBeDefined()
      expect(resourceEvent.resource.method).toEqual('GET')
      expect(resourceEvent.resource.status_code).toEqual(200)
      expect(resourceEvent.resource.duration).toBeGreaterThan(0)
      expect(resourceEvent.resource.download).toBeUndefined()
    })

  createTest('track allowed cross origin xhr timings')
    .withRum()
    .run(async ({ servers, intakeRegistry, flushEvents, sendXhr }) => {
      await sendXhr(`${servers.crossOrigin.origin}/ok?timing-allow-origin=true&duration=${REQUEST_DURATION}`)
      await flushEvents()
      const resourceEvent = intakeRegistry.rumResourceEvents.find((r) => r.resource.url.includes('/ok'))!
      expect(resourceEvent).not.toBeUndefined()
      expect(resourceEvent.resource.method).toEqual('GET')
      expect(resourceEvent.resource.status_code).toEqual(200)
      expectToHaveValidTimings(resourceEvent)
    })

  createTest('retrieve early requests timings')
    .withRum()
    .withHead(html` <link rel="stylesheet" href="/empty.css" /> `)
    .run(async ({ intakeRegistry, flushEvents }) => {
      await flushEvents()
      const resourceEvent = intakeRegistry.rumResourceEvents.find((event) => event.resource.url.includes('empty.css'))
      expect(resourceEvent).toBeDefined()
      expectToHaveValidTimings(resourceEvent!)
    })

  createTest('collect fetch requests made before init with trackEarlyRequests')
    .withHead(html`
      <script>
        fetch('/ok')
      </script>
    `)
    .withRum({ trackEarlyRequests: true })
    .run(async ({ intakeRegistry, flushEvents }) => {
      await flushEvents()
      const resourceEvent = intakeRegistry.rumResourceEvents.find((event) => event.resource.type === 'fetch')
      expect(resourceEvent).toBeDefined()
      expect(resourceEvent!.resource.url).toContain('/ok')
    })

  createTest('retrieve initial document timings')
    .withRum()
    .run(async ({ baseUrl, intakeRegistry, flushEvents }) => {
      await flushEvents()
      const resourceEvent = intakeRegistry.rumResourceEvents.find((event) => event.resource.type === 'document')
      expect(resourceEvent).toBeDefined()
      expect(resourceEvent!.resource.url).toBe(baseUrl)
      expectToHaveValidTimings(resourceEvent!)
    })

  test.describe('XHR abort support', () => {
    createTest('track aborted XHR')
      .withRum()
      .run(async ({ intakeRegistry, flushEvents, page }) => {
        await page.evaluate(
          () =>
            new Promise<void>((resolve) => {
              const xhr = new XMLHttpRequest()
              xhr.open('GET', '/ok?duration=1000')
              xhr.send()
              setTimeout(() => {
                xhr.abort()
                resolve(undefined)
              }, 100)
            })
        )

        await flushEvents()

        expectXHR(intakeRegistry).toBeAborted()
      })

    createTest('aborting an unsent XHR should be ignored')
      .withRum()
      .run(async ({ intakeRegistry, flushEvents, page }) => {
        await page.evaluate(
          () =>
            new Promise<void>((resolve) => {
              const xhr = new XMLHttpRequest()
              xhr.open('GET', '/ok')
              xhr.abort()
              xhr.send()
              xhr.addEventListener('loadend', () => resolve(undefined))
            })
        )

        await flushEvents()

        expectXHR(intakeRegistry).toBeLoaded()
      })

    createTest('aborting an XHR when state becomes DONE and before the loadend event should be ignored')
      .withRum()
      .run(async ({ intakeRegistry, flushEvents, page }) => {
        await page.evaluate(
          () =>
            new Promise<void>((resolve) => {
              const xhr = new XMLHttpRequest()
              xhr.open('GET', '/ok')
              xhr.onreadystatechange = () => {
                if (xhr.readyState === XMLHttpRequest.DONE) {
                  xhr.abort()
                  resolve(undefined)
                }
              }
              xhr.send()
            })
        )

        await flushEvents()

        expectXHR(intakeRegistry).toBeLoaded()
      })

    createTest('aborting an XHR after the loadend event should be ignored')
      .withRum()
      .run(async ({ intakeRegistry, flushEvents, page }) => {
        await page.evaluate(
          () =>
            new Promise<void>((resolve) => {
              const xhr = new XMLHttpRequest()
              xhr.open('GET', '/ok')
              xhr.addEventListener('loadend', () => {
                setTimeout(() => {
                  xhr.abort()
                  resolve(undefined)
                })
              })
              xhr.send()
            })
        )

        await flushEvents()

        expectXHR(intakeRegistry).toBeLoaded()
      })

    function expectXHR(intakeRegistry: IntakeRegistry) {
      const resourceEvent = intakeRegistry.rumResourceEvents.find((event) => event.resource.type === 'xhr')
      expect(resourceEvent).toBeTruthy()

      return {
        toBeAborted() {
          expect(resourceEvent?.resource.status_code).toBe(0)
        },

        toBeLoaded() {
          expect(resourceEvent?.resource.status_code).toBe(200)
        },
      }
    }
  })

  test.describe('fetch abort support', () => {
    createTest('track aborted fetch')
      .withRum()
      .run(async ({ intakeRegistry, flushEvents, page }) => {
        await page.evaluate(
          () =>
            new Promise<void>((resolve) => {
              const controller = new AbortController()
              fetch('/ok?duration=1000', { signal: controller.signal }).catch(() => {
                // ignore abortion error
                resolve(undefined)
              })
              setTimeout(() => {
                controller.abort()
              }, 100)
            })
        )

        await flushEvents()

        const resourceEvent = intakeRegistry.rumResourceEvents.find((event) => event.resource.type === 'fetch')
        expect(resourceEvent).toBeTruthy()
        expect(resourceEvent?.resource.status_code).toBe(0)
      })
  })

  createTest('track redirect fetch timings')
    .withRum()
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            fetch('/redirect?duration=200').then(
              () => resolve(undefined),
              () => {
                throw Error('Issue with fetch call')
              }
            )
          })
      )
      await flushEvents()
      const resourceEvent = intakeRegistry.rumResourceEvents.find((r) => r.resource.url.includes('/redirect'))!
      expect(resourceEvent).not.toBeUndefined()
      expect(resourceEvent.resource.method).toEqual('GET')
      expect(resourceEvent.resource.status_code).toEqual(200)
      expectToHaveValidTimings(resourceEvent)
      expect(resourceEvent.resource.redirect).not.toBeUndefined()
      expect(resourceEvent.resource.redirect!.duration).toBeGreaterThan(0)
    })

  createTest('track concurrent fetch to same resource')
    .withRum()
    .run(async ({ intakeRegistry, flushEvents, page, browserName }) => {
      test.skip(browserName === 'webkit', 'Safari does not emit predictable timings events for concurrent fetches')

      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            Promise.all([fetch('/ok'), fetch('/ok')])
              .then(() => resolve())
              .catch(() => resolve())
          })
      )

      await flushEvents()

      const resourceEvents = intakeRegistry.rumResourceEvents.filter((event) => event.resource.type === 'fetch')

      expect(resourceEvents[0]).toBeTruthy()
      expect(resourceEvents[0]?.resource.size).toBeDefined()

      expect(resourceEvents[1]).toBeTruthy()
      expect(resourceEvents[1]?.resource.size).toBeDefined()
    })

  test.describe('resource response content-type', () => {
    createTest('collect resource response content-type for static resources')
      .withRum()
      .withHead(html`<link rel="stylesheet" href="/empty.css" />`)
      .run(async ({ intakeRegistry, flushEvents, browserName }) => {
        test.skip(
          isContentTypeAvailableInPerformanceEntry(test, browserName) === false,
          'contentType is not available in this browser'
        )

        await flushEvents()

        const resourceEvent = intakeRegistry.rumResourceEvents.find((event) => event.resource.url.includes('empty.css'))
        expect(resourceEvent).toBeDefined()
        expect(resourceEvent!.resource.response).toBeDefined()
        expect(resourceEvent!.resource.response!.headers).toBeDefined()
        expect(resourceEvent!.resource.response!.headers!['content-type']).toBe('text/css')
      })

    createTest('collect resource response content-type for XHR resources')
      .withRum()
      .run(async ({ intakeRegistry, flushEvents, page, browserName }) => {
        // Firefox 129+ can use resource timing entries to collect xhr content-type,
        // other browsers will have to retrieve the it from the response headers
        test.skip(
          isContentTypeAvailableInPerformanceEntry(test, browserName) === false,
          'contentType is not available in this browser'
        )

        await page.evaluate(
          () =>
            new Promise<void>((resolve) => {
              const xhr = new XMLHttpRequest()
              xhr.addEventListener('loadend', () => resolve())
              xhr.open('GET', '/ok')
              xhr.send()
            })
        )

        await flushEvents()

        const resourceEvent = intakeRegistry.rumResourceEvents.find((event) => event.resource.type === 'xhr')
        expect(resourceEvent).toBeDefined()
        expect(resourceEvent!.resource.response).toBeDefined()
        expect(resourceEvent!.resource.response!.headers).toBeDefined()
        expect(resourceEvent!.resource.response!.headers!['content-type']).toBe('text/plain')
      })

    createTest('collect resource response content-type for fetch resources')
      .withRum()
      .run(async ({ intakeRegistry, flushEvents, page, browserName }) => {
        // Firefox 129+ can use resource timing entries to collect fetch content-type
        // other browsers will have to retrieve the it from the response headers
        test.skip(
          isContentTypeAvailableInPerformanceEntry(test, browserName) === false,
          'contentType is not available in this browser'
        )

        await page.evaluate(() => fetch('/ok'))

        await flushEvents()

        const resourceEvent = intakeRegistry.rumResourceEvents.find((event) => event.resource.type === 'fetch')
        expect(resourceEvent).toBeDefined()
        expect(resourceEvent!.resource.response).toBeDefined()
        expect(resourceEvent!.resource.response!.headers).toBeDefined()
        expect(resourceEvent!.resource.response!.headers!['content-type']).toBe('text/plain')
      })
  })

  test.describe('support XHRs with same XMLHttpRequest instance', () => {
    createTest('track XHRs when calling requests one after another')
      .withRum()
      .run(async ({ intakeRegistry, flushEvents, page }) => {
        await page.evaluate(
          () =>
            new Promise<void>((resolve) => {
              const xhr = new XMLHttpRequest()
              const triggerSecondCall = () => {
                xhr.removeEventListener('loadend', triggerSecondCall)
                xhr.addEventListener('loadend', () => resolve(undefined))
                xhr.open('GET', '/ok?duration=100&call=2')
                xhr.send()
              }
              xhr.addEventListener('loadend', triggerSecondCall)
              xhr.open('GET', '/ok?duration=100&call=1')
              xhr.send()
            })
        )

        await flushEvents()

        const resourceEvents = intakeRegistry.rumResourceEvents.filter((event) => event.resource.type === 'xhr')
        expect(resourceEvents).toHaveLength(2)
        expect(intakeRegistry.rumErrorEvents).toHaveLength(0)
        expect(resourceEvents[0].resource.url).toContain('/ok?duration=100&call=1')
        expect(resourceEvents[0].resource.status_code).toEqual(200)
        expect(resourceEvents[1].resource.url).toContain('/ok?duration=100&call=2')
        expect(resourceEvents[1].resource.status_code).toEqual(200)
      })
  })
})

function expectToHaveValidTimings(resourceEvent: RumResourceEvent) {
  expect(resourceEvent.date).toBeGreaterThan(0)
  expect(resourceEvent.resource.duration).toBeGreaterThan(0)
  const download = resourceEvent.resource.download
  // timing could have been discarded by the SDK if there was not in the correct order
  if (download) {
    expect(download.start).toBeGreaterThan(0)
  }
}

test.describe('resource headers with trackResourceHeaders', () => {
  const TRACK_RESOURCE_HEADERS_CONFIG = {
    enableExperimentalFeatures: ['track_resource_headers'],
    trackResourceHeaders: true,
  }

  function okUrl(responseHeaders: Record<string, string>): string {
    const params = new URLSearchParams(
      Object.entries(responseHeaders).map(([name, value]) => [`response-headers[${name}]`, value])
    )
    return `/ok?${params}`
  }

  createTest('collect response and request headers for fetch when trackResourceHeaders is on')
    .withRum(TRACK_RESOURCE_HEADERS_CONFIG)
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      const url = okUrl({ 'Cache-Control': 'no-cache' })
      await page.evaluate(
        (u) =>
          fetch(u, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: 'value' }),
          }),
        url
      )

      await flushEvents()

      const resourceEvent = intakeRegistry.rumResourceEvents.find((r) => r.resource.type === 'fetch')
      expect(resourceEvent).toBeDefined()
      expect(resourceEvent!.resource.response!.headers!['content-type']).toBe('text/plain; charset=utf-8')
      expect(resourceEvent!.resource.response!.headers!['cache-control']).toBe('no-cache')
      expect(resourceEvent!.resource.request!.headers!['content-type']).toBe('application/json')
    })

  createTest('collect response headers for XHR')
    .withRum(TRACK_RESOURCE_HEADERS_CONFIG)
    .run(async ({ intakeRegistry, flushEvents, sendXhr }) => {
      await sendXhr(okUrl({ 'Cache-Control': 'no-cache' }))

      await flushEvents()

      const resourceEvent = intakeRegistry.rumResourceEvents.find((r) => r.resource.type === 'xhr')
      expect(resourceEvent).toBeDefined()
      expect(resourceEvent!.resource.response!.headers!['content-type']).toBe('text/plain; charset=utf-8')
      expect(resourceEvent!.resource.response!.headers!['cache-control']).toBe('no-cache')
    })

  createTest('collect headers when MatchHeader uses mixed-case string name')
    .withRum({
      ...TRACK_RESOURCE_HEADERS_CONFIG,
      trackResourceHeaders: [{ name: 'Content-Type', location: 'response' }],
    })
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      await page.evaluate((u) => fetch(u), okUrl({ 'Cache-Control': 'no-cache' }))

      await flushEvents()

      const resourceEvent = intakeRegistry.rumResourceEvents.find((r) => r.resource.type === 'fetch')
      expect(resourceEvent).toBeDefined()
      expect(resourceEvent!.resource.response!.headers!['content-type']).toBe('text/plain; charset=utf-8')
    })

  createTest('do not collect resource headers when trackResourceHeaders is not set')
    .withRum({ ...TRACK_RESOURCE_HEADERS_CONFIG, trackResourceHeaders: undefined })
    .run(async ({ intakeRegistry, flushEvents, sendXhr, page }) => {
      const url = okUrl({ 'Cache-Control': 'no-cache' })
      await sendXhr(url)
      await page.evaluate((u) => fetch(u), url)

      await flushEvents()

      const xhrEvent = intakeRegistry.rumResourceEvents.find((r) => r.resource.type === 'xhr')
      expect(xhrEvent).toBeDefined()
      expect(xhrEvent!.resource.request).toBeUndefined()
      expect(xhrEvent!.resource.response?.headers?.['cache-control']).toBeUndefined()

      const fetchEvent = intakeRegistry.rumResourceEvents.find((r) => r.resource.type === 'fetch')
      expect(fetchEvent).toBeDefined()
      expect(fetchEvent!.resource.request).toBeUndefined()
      expect(fetchEvent!.resource.response?.headers?.['cache-control']).toBeUndefined()
    })
})

test.describe('manual resources with startResource/stopResource', () => {
  createTest('track a manual resource with startResource/stopResource')
    .withRum({ enableExperimentalFeatures: ['start_stop_resource'] })
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      await page.evaluate(() => {
        window.DD_RUM!.startResource('https://api.example.com/data')
        window.DD_RUM!.stopResource('https://api.example.com/data')
      })
      await flushEvents()

      const resourceEvents = intakeRegistry.rumResourceEvents.filter((r) =>
        r.resource.url.includes('api.example.com/data')
      )
      expect(resourceEvents).toHaveLength(1)
      expect(resourceEvents[0].resource.url).toBe('https://api.example.com/data')
      expect(resourceEvents[0].resource.type).toBe('other')
      expect(resourceEvents[0].resource.id).toBeDefined()
    })

  createTest('track a manual resource with type and method')
    .withRum({ enableExperimentalFeatures: ['start_stop_resource'] })
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      await page.evaluate(() => {
        window.DD_RUM!.startResource('https://api.example.com/users', {
          type: 'fetch',
          method: 'POST',
        })
        window.DD_RUM!.stopResource('https://api.example.com/users', {
          statusCode: 201,
        })
      })
      await flushEvents()

      const resourceEvents = intakeRegistry.rumResourceEvents.filter((r) =>
        r.resource.url.includes('api.example.com/users')
      )
      expect(resourceEvents).toHaveLength(1)
      expect(resourceEvents[0].resource.type).toBe('fetch')
      expect(resourceEvents[0].resource.method).toBe('POST')
      expect(resourceEvents[0].resource.status_code).toBe(201)
    })

  createTest('track multiple concurrent manual resources with resourceKey')
    .withRum({ enableExperimentalFeatures: ['start_stop_resource'] })
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      await page.evaluate(() => {
        window.DD_RUM!.startResource('https://api.example.com/data', { resourceKey: 'request1' })
        window.DD_RUM!.startResource('https://api.example.com/data', { resourceKey: 'request2' })
        window.DD_RUM!.stopResource('https://api.example.com/data', { resourceKey: 'request2' })
        window.DD_RUM!.stopResource('https://api.example.com/data', { resourceKey: 'request1' })
      })
      await flushEvents()

      const resourceEvents = intakeRegistry.rumResourceEvents.filter((r) =>
        r.resource.url.includes('api.example.com/data')
      )
      expect(resourceEvents).toHaveLength(2)
      expect(resourceEvents[0].resource.id).not.toBe(resourceEvents[1].resource.id)
    })

  createTest('merge contexts from start and stop')
    .withRum({ enableExperimentalFeatures: ['start_stop_resource'] })
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      await page.evaluate(() => {
        window.DD_RUM!.startResource('https://api.example.com/data', {
          context: { request_id: 'abc123' },
        })
        window.DD_RUM!.stopResource('https://api.example.com/data', {
          context: { response_size: 1024 },
        })
      })
      await flushEvents()

      const resourceEvents = intakeRegistry.rumResourceEvents.filter((r) =>
        r.resource.url.includes('api.example.com/data')
      )
      expect(resourceEvents).toHaveLength(1)
      expect(resourceEvents[0].context).toEqual(
        expect.objectContaining({
          request_id: 'abc123',
          response_size: 1024,
        })
      )
    })

  createTest('preserve timing when startResource is called before init')
    .withRum({ enableExperimentalFeatures: ['start_stop_resource'] })
    .withRumInit((configuration) => {
      window.DD_RUM!.startResource('https://api.example.com/early')

      setTimeout(() => {
        window.DD_RUM!.init(configuration)
        window.DD_RUM!.stopResource('https://api.example.com/early')
      }, 50)
    })
    .run(async ({ intakeRegistry, flushEvents }) => {
      await flushEvents()

      const resourceEvents = intakeRegistry.rumResourceEvents.filter((r) =>
        r.resource.url.includes('api.example.com/early')
      )
      expect(resourceEvents).toHaveLength(1)
      expect(resourceEvents[0].resource.url).toBe('https://api.example.com/early')
      expect(resourceEvents[0].resource.duration).toBeGreaterThanOrEqual(40 * 1e6)
    })
})
