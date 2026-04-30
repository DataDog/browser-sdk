import { test, expect } from '@playwright/test'
import { createTest, html } from '../lib/framework'

test.describe('bridge present', () => {
  createTest('send action')
    .withRum({ trackUserInteractions: true })
    .withEventBridge()
    .withBody(html`
      <button>click me</button>
      <script>
        const button = document.querySelector('button')
        button.addEventListener('click', () => {
          button.setAttribute('data-clicked', 'true')
        })
      </script>
    `)
    .run(async ({ flushEvents, intakeRegistry, page }) => {
      const button = page.locator('button')
      await button.click()
      // wait for click chain to close
      await page.waitForTimeout(1000)
      await flushEvents()

      expect(intakeRegistry.rumActionEvents).toHaveLength(1)
      expect(intakeRegistry.hasOnlyBridgeRequests).toBe(true)
    })

  createTest('send error')
    .withRum()
    .withEventBridge()
    .run(async ({ flushBrowserLogs, flushEvents, intakeRegistry, page }) => {
      await page.evaluate(() => {
        console.error('oh snap')
      })

      flushBrowserLogs()
      await flushEvents()

      expect(intakeRegistry.rumErrorEvents).toHaveLength(1)
      expect(intakeRegistry.hasOnlyBridgeRequests).toBe(true)
    })

  createTest('send resource')
    .withRum()
    .withEventBridge()
    .run(async ({ flushEvents, intakeRegistry }) => {
      await flushEvents()

      expect(intakeRegistry.rumResourceEvents.length).toBeGreaterThan(0)
      expect(intakeRegistry.hasOnlyBridgeRequests).toBe(true)
    })

  createTest('send view')
    .withRum()
    .withEventBridge()
    .run(async ({ flushEvents, intakeRegistry }) => {
      await flushEvents()

      expect(intakeRegistry.rumViewEvents.length).toBeGreaterThan(0)
      expect(intakeRegistry.hasOnlyBridgeRequests).toBe(true)
    })

  createTest('forward telemetry to the bridge')
    .withLogs()
    .withEventBridge()
    .run(async ({ flushEvents, intakeRegistry, page }) => {
      await page.evaluate(() => {
        const context = {
          get foo() {
            throw new window.Error('bar')
          },
        }
        window.DD_LOGS!.logger.log('hop', context as any)
      })

      await flushEvents()
      expect(intakeRegistry.telemetryErrorEvents).toHaveLength(1)
      expect(intakeRegistry.hasOnlyBridgeRequests).toBe(true)
      intakeRegistry.empty()
    })

  createTest('forward logs to the bridge')
    .withLogs()
    .withEventBridge()
    .run(async ({ flushEvents, intakeRegistry, page }) => {
      await page.evaluate(() => {
        window.DD_LOGS!.logger.log('hello')
      })
      await flushEvents()

      expect(intakeRegistry.logsEvents).toHaveLength(1)
      expect(intakeRegistry.hasOnlyBridgeRequests).toBe(true)
    })

  createTest('send records to the bridge')
    .withRum()
    .withEventBridge()
    .run(async ({ flushEvents, intakeRegistry }) => {
      await flushEvents()

      expect(intakeRegistry.replayRecords.length).toBeGreaterThan(0)
      expect(intakeRegistry.hasOnlyBridgeRequests).toBe(true)
    })

  createTest('override trace sample rate when bridge provides isTraceSampled true')
    .withRum({ service: 'service', traceSampleRate: 0, allowedTracingUrls: ['LOCATION_ORIGIN'] })
    .withEventBridge({ isTraceSampled: true })
    .run(async ({ flushEvents, intakeRegistry, sendXhr }) => {
      await sendXhr('/headers')
      await flushEvents()

      const tracedResources = intakeRegistry.rumResourceEvents.filter(
        (event) => event.resource.type === 'xhr' && event._dd?.trace_id
      )
      expect(tracedResources).toHaveLength(1)
      expect(tracedResources[0]._dd.trace_id).toMatch(/\d+/)
    })

  createTest('override trace sample rate when bridge provides isTraceSampled false')
    .withRum({ service: 'service', traceSampleRate: 100, allowedTracingUrls: ['LOCATION_ORIGIN'] })
    .withEventBridge({ isTraceSampled: false })
    .run(async ({ flushEvents, intakeRegistry, sendXhr }) => {
      await sendXhr('/headers')
      await flushEvents()

      const xhrResources = intakeRegistry.rumResourceEvents.filter((event) => event.resource.type === 'xhr')
      expect(xhrResources).toHaveLength(1)
      expect(xhrResources[0]._dd?.trace_id).toBeUndefined()
    })

  createTest('do not send records when the recording is stopped')
    .withRum()
    .withEventBridge()
    .run(async ({ flushEvents, intakeRegistry, page }) => {
      // wait for recorder to be properly started
      await page.waitForTimeout(200)

      const preStopRecordsCount = intakeRegistry.replayRecords.length
      await page.evaluate(() => {
        window.DD_RUM!.stopSessionReplayRecording()

        // trigger a new record
        document.body.appendChild(document.createElement('li'))
      })

      await flushEvents()

      const postStopRecordsCount = intakeRegistry.replayRecords.length - preStopRecordsCount
      expect(postStopRecordsCount).toEqual(0)
    })
})
