import { test, expect } from '@playwright/test'
import type { RumResourceEvent } from '@datadog/browser-rum'
import type { IntakeRegistry } from '../../lib/framework'
import { bundleSetup, createTest, html } from '../../lib/framework'

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
    .run(async ({ crossOriginUrl, intakeRegistry, flushEvents, sendXhr }) => {
      await sendXhr(`${crossOriginUrl}/ok?duration=${REQUEST_DURATION}`)
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
    .run(async ({ crossOriginUrl, intakeRegistry, flushEvents, sendXhr }) => {
      await sendXhr(`${crossOriginUrl}/ok?timing-allow-origin=true&duration=${REQUEST_DURATION}`)
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

  createTest('retrieve initial document timings')
    .withRum()
    .run(async ({ baseUrl, intakeRegistry, flushEvents }) => {
      await flushEvents()
      const resourceEvent = intakeRegistry.rumResourceEvents.find((event) => event.resource.type === 'document')
      expect(resourceEvent).toBeDefined()
      expect(resourceEvent!.resource.url).toBe(`${baseUrl}/`)
      expectToHaveValidTimings(resourceEvent!)
    })

  test.describe('XHR abort support', () => {
    createTest('track aborted XHR')
      .withRum()
      .withSetup(bundleSetup)
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
      .withSetup(bundleSetup)
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
      .withSetup(bundleSetup)
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
      .withSetup(bundleSetup)
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
      .withSetup(bundleSetup)
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
    .withSetup(bundleSetup)
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

  test.describe('support XHRs with same XMLHttpRequest instance', () => {
    createTest('track XHRs when calling requests one after another')
      .withRum()
      .withSetup(bundleSetup)
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
