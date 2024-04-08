import { flushBrowserLogs } from '../lib/helpers/browser'
import { createTest, flushEvents, html } from '../lib/framework'

describe('bridge present', () => {
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
    .run(async ({ intakeRegistry }) => {
      const button = await $('button')
      await button.click()
      // wait for click chain to close
      await browser.pause(1000)
      await flushEvents()

      expect(intakeRegistry.rumActionEvents.length).toBe(1)
      expect(intakeRegistry.hasOnlyBridgeRequests).toBe(true)
    })

  createTest('send error')
    .withRum()
    .withEventBridge()
    .run(async ({ intakeRegistry }) => {
      await browser.execute(() => {
        console.error('oh snap')
      })

      await flushBrowserLogs()
      await flushEvents()

      expect(intakeRegistry.rumErrorEvents.length).toBe(1)
      expect(intakeRegistry.hasOnlyBridgeRequests).toBe(true)
    })

  createTest('send resource')
    .withRum()
    .withEventBridge()
    .run(async ({ intakeRegistry }) => {
      await flushEvents()

      expect(intakeRegistry.rumResourceEvents.length).toBeGreaterThan(0)
      expect(intakeRegistry.hasOnlyBridgeRequests).toBe(true)
    })

  createTest('send view')
    .withRum()
    .withEventBridge()
    .run(async ({ intakeRegistry }) => {
      await flushEvents()

      expect(intakeRegistry.rumViewEvents.length).toBeGreaterThan(0)
      expect(intakeRegistry.hasOnlyBridgeRequests).toBe(true)
    })

  createTest('forward telemetry to the bridge')
    .withLogs()
    .withEventBridge()
    .run(async ({ intakeRegistry }) => {
      await browser.execute(() => {
        const context = {
          get foo() {
            throw new window.Error('bar')
          },
        }
        window.DD_LOGS!.logger.log('hop', context as any)
      })

      await flushEvents()
      expect(intakeRegistry.telemetryErrorEvents.length).toBe(1)
      expect(intakeRegistry.hasOnlyBridgeRequests).toBe(true)
      intakeRegistry.empty()
    })

  createTest('forward logs to the bridge')
    .withLogs()
    .withEventBridge()
    .run(async ({ intakeRegistry }) => {
      await browser.execute(() => {
        window.DD_LOGS!.logger.log('hello')
      })
      await flushEvents()

      expect(intakeRegistry.logsEvents.length).toBe(1)
      expect(intakeRegistry.hasOnlyBridgeRequests).toBe(true)
    })

  createTest('send records to the bridge')
    .withRum()
    .withEventBridge()
    .run(async ({ intakeRegistry }) => {
      await flushEvents()

      expect(intakeRegistry.replayRecords.length).toBeGreaterThan(0)
      expect(intakeRegistry.hasOnlyBridgeRequests).toBe(true)
    })

  createTest('do not send records when the recording is stopped')
    .withRum()
    .withEventBridge()
    .run(async ({ intakeRegistry }) => {
      // wait for recorder to be properly started
      await browser.pause(200)

      const preStopRecordsCount = intakeRegistry.replayRecords.length
      await browser.execute(() => {
        window.DD_RUM!.stopSessionReplayRecording()

        // trigger a new record
        document.body.appendChild(document.createElement('li'))
      })

      await flushEvents()

      const postStopRecordsCount = intakeRegistry.replayRecords.length - preStopRecordsCount
      expect(postStopRecordsCount).toEqual(0)
    })
})
