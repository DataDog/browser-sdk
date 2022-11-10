import type { RumResourceEvent } from '@datadog/browser-rum'
import type { EventRegistry } from '../../lib/framework'
import { flushEvents, bundleSetup, createTest, html, LARGE_RESPONSE_MIN_BYTE_SIZE } from '../../lib/framework'
import { browserExecuteAsync, sendXhr } from '../../lib/helpers/browser'

const REQUEST_DURATION = 200

describe('rum resources', () => {
  createTest('track xhr timings')
    .withRum()
    .run(async ({ serverEvents }) => {
      await sendXhr(`/ok?duration=${REQUEST_DURATION}`)
      await flushEvents()
      const resourceEvent = serverEvents.rumResources.find((r) => r.resource.url.includes('/ok'))!
      expect(resourceEvent).toBeDefined()
      expect(resourceEvent.resource.method).toBe('GET')
      expect(resourceEvent.resource.status_code).toBe(200)
      expectToHaveValidTimings(resourceEvent)
    })

  createTest('track redirect xhr timings')
    .withRum()
    .run(async ({ serverEvents }) => {
      await sendXhr(`/redirect?duration=${REQUEST_DURATION}`)
      await flushEvents()
      const resourceEvent = serverEvents.rumResources.find((r) => r.resource.url.includes('/redirect'))!
      expect(resourceEvent).not.toBeUndefined()
      expect(resourceEvent.resource.method).toEqual('GET')
      expect(resourceEvent.resource.status_code).toEqual(200)
      expectToHaveValidTimings(resourceEvent)
      expect(resourceEvent.resource.redirect).not.toBeUndefined()
      expect(resourceEvent.resource.redirect!.duration).toBeGreaterThan(0)
    })

  createTest("don't track disallowed cross origin xhr timings")
    .withRum()
    .run(async ({ crossOriginUrl, serverEvents }) => {
      await sendXhr(`${crossOriginUrl}/ok?duration=${REQUEST_DURATION}`)
      await flushEvents()
      const resourceEvent = serverEvents.rumResources.find((r) => r.resource.url.includes('/ok'))!
      expect(resourceEvent).toBeDefined()
      expect(resourceEvent.resource.method).toEqual('GET')
      expect(resourceEvent.resource.status_code).toEqual(200)
      expect(resourceEvent.resource.duration).toBeGreaterThan(0)
      expect(resourceEvent.resource.download).toBeUndefined()
    })

  createTest('track allowed cross origin xhr timings')
    .withRum()
    .run(async ({ crossOriginUrl, serverEvents }) => {
      await sendXhr(`${crossOriginUrl}/ok?timing-allow-origin=true&duration=${REQUEST_DURATION}`)
      await flushEvents()
      const resourceEvent = serverEvents.rumResources.find((r) => r.resource.url.includes('/ok'))!
      expect(resourceEvent).not.toBeUndefined()
      expect(resourceEvent.resource.method).toEqual('GET')
      expect(resourceEvent.resource.status_code).toEqual(200)
      expectToHaveValidTimings(resourceEvent)
    })

  createTest('retrieve early requests timings')
    .withRum()
    .withHead(html` <link rel="stylesheet" href="/empty.css" /> `)
    .run(async ({ serverEvents }) => {
      await flushEvents()
      const resourceEvent = serverEvents.rumResources.find((event) => event.resource.url.includes('empty.css'))
      expect(resourceEvent).toBeDefined()
      expectToHaveValidTimings(resourceEvent!)
    })

  createTest('retrieve initial document timings')
    .withRum()
    .run(async ({ baseUrl, serverEvents }) => {
      await flushEvents()
      const resourceEvent = serverEvents.rumResources.find((event) => event.resource.type === 'document')
      expect(resourceEvent).toBeDefined()
      expect(resourceEvent!.resource.url).toBe(`${baseUrl}/`)
      expectToHaveValidTimings(resourceEvent!)
    })

  describe('XHR abort support', () => {
    createTest('track aborted XHR')
      .withRum()
      .withSetup(bundleSetup)
      .run(async ({ serverEvents }) => {
        await browserExecuteAsync((done) => {
          const xhr = new XMLHttpRequest()
          xhr.open('GET', '/ok?duration=1000')
          xhr.send()
          setTimeout(() => {
            xhr.abort()
            done(undefined)
          }, 100)
        })

        await flushEvents()

        expectXHR(serverEvents).toBeAborted()
      })

    createTest('aborting an unsent XHR should be ignored')
      .withRum()
      .withSetup(bundleSetup)
      .run(async ({ serverEvents }) => {
        await browserExecuteAsync((done) => {
          const xhr = new XMLHttpRequest()
          xhr.open('GET', '/ok')
          xhr.abort()
          xhr.send()
          xhr.addEventListener('loadend', () => done(undefined))
        })

        await flushEvents()

        expectXHR(serverEvents).toBeLoaded()
      })

    createTest('aborting an XHR when state becomes DONE and before the loadend event should be ignored')
      .withRum()
      .withSetup(bundleSetup)
      .run(async ({ serverEvents }) => {
        await browserExecuteAsync((done) => {
          const xhr = new XMLHttpRequest()
          xhr.open('GET', '/ok')
          xhr.onreadystatechange = () => {
            if (xhr.readyState === XMLHttpRequest.DONE) {
              xhr.abort()
              done(undefined)
            }
          }
          xhr.send()
        })

        await flushEvents()

        expectXHR(serverEvents).toBeLoaded()
      })

    createTest('aborting an XHR after the loadend event should be ignored')
      .withRum()
      .withSetup(bundleSetup)
      .run(async ({ serverEvents }) => {
        await browserExecuteAsync((done) => {
          const xhr = new XMLHttpRequest()
          xhr.open('GET', '/ok')
          xhr.addEventListener('loadend', () => {
            setTimeout(() => {
              xhr.abort()
              done(undefined)
            })
          })
          xhr.send()
        })

        await flushEvents()

        expectXHR(serverEvents).toBeLoaded()
      })

    function expectXHR(events: EventRegistry) {
      const resourceEvent = events.rumResources.find((event) => event.resource.type === 'xhr')
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

  describe('fetch abort support', () => {
    createTest('track aborted fetch')
      .withRum()
      .withSetup(bundleSetup)
      .run(async ({ serverEvents }) => {
        await browserExecuteAsync((done) => {
          const controller = new AbortController()
          fetch('/ok?duration=1000', { signal: controller.signal }).catch(() => {
            // ignore abortion error
            done(undefined)
          })
          setTimeout(() => {
            controller.abort()
          }, 100)
        })

        await flushEvents()

        const resourceEvent = serverEvents.rumResources.find((event) => event.resource.type === 'fetch')
        expect(resourceEvent).toBeTruthy()
        expect(resourceEvent?.resource.status_code).toBe(0)
      })

    createTest('aborting a request stops the response download')
      .withLogs({ forwardErrorsToLogs: true })
      .withRum()
      .run(async ({ servers }) => {
        await browserExecuteAsync((done) => {
          const controller = new AbortController()
          const signal = controller.signal

          fetch('/large-response', { signal }).then(() => {
            controller.abort()
            done(undefined)
          }, console.log)
        })

        await flushEvents()
        expect(servers.base.app.getLargeResponseWroteSize()).toBeLessThan(LARGE_RESPONSE_MIN_BYTE_SIZE)
      })
  })

  createTest('track redirect fetch timings')
    .withRum()
    .run(async ({ serverEvents }) => {
      await browserExecuteAsync((done) => {
        fetch('/redirect?duration=200').then(
          () => done(undefined),
          () => {
            throw Error('Issue with fetch call')
          }
        )
      })
      await flushEvents()
      const resourceEvent = serverEvents.rumResources.find((r) => r.resource.url.includes('/redirect'))!
      expect(resourceEvent).not.toBeUndefined()
      expect(resourceEvent.resource.method).toEqual('GET')
      expect(resourceEvent.resource.status_code).toEqual(200)
      expectToHaveValidTimings(resourceEvent)
      expect(resourceEvent.resource.redirect).not.toBeUndefined()
      expect(resourceEvent.resource.redirect!.duration).toBeGreaterThan(0)
    })

  describe('support XHRs with same XMLHttpRequest instance', () => {
    createTest('track XHRs when calling requests one after another')
      .withRum()
      .withSetup(bundleSetup)
      .run(async ({ serverEvents }) => {
        await browserExecuteAsync((done) => {
          const xhr = new XMLHttpRequest()
          const triggerSecondCall = () => {
            xhr.removeEventListener('loadend', triggerSecondCall)
            xhr.addEventListener('loadend', () => done(undefined))
            xhr.open('GET', '/ok?duration=100&call=2')
            xhr.send()
          }
          xhr.addEventListener('loadend', triggerSecondCall)
          xhr.open('GET', '/ok?duration=100&call=1')
          xhr.send()
        })

        await flushEvents()

        const resourceEvents = serverEvents.rumResources.filter((event) => event.resource.type === 'xhr')
        expect(resourceEvents.length).toEqual(2)
        expect(serverEvents.rumErrors.length).toBe(0)
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
