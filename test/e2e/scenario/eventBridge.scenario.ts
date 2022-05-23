import { browserExecute, flushBrowserLogs } from '../lib/helpers/browser'
import { createTest, html } from '../lib/framework'
import { flushEvents } from '../lib/helpers/flushEvents'

describe('bridge present', () => {
  createTest('send action')
    .withRum({ trackInteractions: true })
    .withEventBridge()
    .withBody(
      html`
        <button>click me</button>
        <script>
          const button = document.querySelector('button')
          button.addEventListener('click', () => {
            button.setAttribute('data-clicked', 'true')
          })
        </script>
      `
    )
    .run(async ({ serverEvents, bridgeEvents }) => {
      const button = await $('button')
      await button.click()
      await flushEvents()

      expect(serverEvents.rumActions.length).toBe(0)
      expect(bridgeEvents.rumActions.length).toBe(1)
    })

  createTest('send error')
    .withRum()
    .withEventBridge()
    .run(async ({ serverEvents, bridgeEvents }) => {
      await browserExecute(() => {
        console.error('oh snap')
      })

      await flushBrowserLogs()
      await flushEvents()

      expect(serverEvents.rumErrors.length).toBe(0)
      expect(bridgeEvents.rumErrors.length).toBeGreaterThan(0)
    })

  createTest('send resource')
    .withRum()
    .withEventBridge()
    .run(async ({ serverEvents, bridgeEvents }) => {
      await flushEvents()

      expect(serverEvents.rumResources.length).toEqual(0)
      expect(bridgeEvents.rumResources.length).toBeGreaterThan(0)
    })

  createTest('send view')
    .withRum()
    .withEventBridge()
    .run(async ({ serverEvents, bridgeEvents }) => {
      await flushEvents()

      expect(serverEvents.rumViews.length).toEqual(0)
      expect(bridgeEvents.rumViews.length).toBeGreaterThan(0)
    })

  createTest('forward telemetry to the bridge')
    .withLogs()
    .withEventBridge()
    .run(async ({ serverEvents, bridgeEvents }) => {
      await browserExecute(() => {
        const context = {
          get foo() {
            throw new window.Error('bar')
          },
        }
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        window.DD_LOGS!.logger.log('hop', context as any)
      })

      await flushEvents()
      expect(serverEvents.telemetry.length).toBe(0)
      expect(bridgeEvents.telemetry.length).toBe(1)
    })

  createTest('forward logs to the bridge')
    .withLogs()
    .withEventBridge()
    .run(async ({ serverEvents, bridgeEvents }) => {
      await browserExecute(() => {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        window.DD_LOGS!.logger.log('hello')
      })
      await flushEvents()

      expect(serverEvents.logs.length).toBe(0)
      expect(bridgeEvents.logs.length).toBe(1)
    })
})
