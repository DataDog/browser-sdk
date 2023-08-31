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

      expect(intakeRegistry.rumActions.length).toBe(0)
      expect(bridgeEvents.rumActions.length).toBe(1)
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

      expect(intakeRegistry.rumErrors.length).toBe(0)
      expect(bridgeEvents.rumErrors.length).toBeGreaterThan(0)
    })

  createTest('send resource')
    .withRum()
    .withEventBridge()
    .run(async ({ intakeRegistry, bridgeEvents }) => {
      await flushEvents()

      expect(intakeRegistry.rumResources.length).toEqual(0)
      expect(bridgeEvents.rumResources.length).toBeGreaterThan(0)
    })

  createTest('send view')
    .withRum()
    .withEventBridge()
    .run(async ({ intakeRegistry, bridgeEvents }) => {
      await flushEvents()

      expect(intakeRegistry.rumViews.length).toEqual(0)
      expect(bridgeEvents.rumViews.length).toBeGreaterThan(0)
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
      expect(intakeRegistry.telemetryErrors.length).toBe(0)
      expect(bridgeEvents.telemetryErrors.length).toBe(1)
    })

  createTest('forward logs to the bridge')
    .withLogs()
    .withEventBridge()
    .run(async ({ intakeRegistry, bridgeEvents }) => {
      await browserExecute(() => {
        window.DD_LOGS!.logger.log('hello')
      })
      await flushEvents()

      expect(intakeRegistry.logs.length).toBe(0)
      expect(bridgeEvents.logs.length).toBe(1)
    })
})
