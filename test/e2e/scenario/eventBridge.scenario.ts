import { browserExecute, flushBrowserLogs } from '../lib/helpers/browser'
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
    .run(async ({ intakeRegistry, bridgeEvents }) => {
      const button = await $('button')
      await button.click()
      await flushEvents()

      expect(intakeRegistry.rumActionEvents.length).toBe(0)
      expect(bridgeEvents.rumActionEvents.length).toBe(1)
    })

  createTest('send error')
    .withRum()
    .withEventBridge()
    .run(async ({ intakeRegistry, bridgeEvents }) => {
      await browserExecute(() => {
        console.error('oh snap')
      })

      await flushBrowserLogs()
      await flushEvents()

      expect(intakeRegistry.rumErrorEvents.length).toBe(0)
      expect(bridgeEvents.rumErrorEvents.length).toBeGreaterThan(0)
    })

  createTest('send resource')
    .withRum()
    .withEventBridge()
    .run(async ({ intakeRegistry, bridgeEvents }) => {
      await flushEvents()

      expect(intakeRegistry.rumResourceEvents.length).toEqual(0)
      expect(bridgeEvents.rumResourceEvents.length).toBeGreaterThan(0)
    })

  createTest('send view')
    .withRum()
    .withEventBridge()
    .run(async ({ intakeRegistry, bridgeEvents }) => {
      await flushEvents()

      expect(intakeRegistry.rumViewEvents.length).toEqual(0)
      expect(bridgeEvents.rumViewEvents.length).toBeGreaterThan(0)
    })

  createTest('forward telemetry to the bridge')
    .withLogs()
    .withEventBridge()
    .run(async ({ intakeRegistry, bridgeEvents }) => {
      await browserExecute(() => {
        const context = {
          get foo() {
            throw new window.Error('bar')
          },
        }
        window.DD_LOGS!.logger.log('hop', context as any)
      })

      await flushEvents()
      expect(intakeRegistry.telemetryErrorEvents.length).toBe(0)
      expect(bridgeEvents.telemetryErrorEvents.length).toBe(1)
    })

  createTest('forward logs to the bridge')
    .withLogs()
    .withEventBridge()
    .run(async ({ intakeRegistry, bridgeEvents }) => {
      await browserExecute(() => {
        window.DD_LOGS!.logger.log('hello')
      })
      await flushEvents()

      expect(intakeRegistry.logsEvents.length).toBe(0)
      expect(bridgeEvents.logsEvents.length).toBe(1)
    })
})
