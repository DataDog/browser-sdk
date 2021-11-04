import { browserExecute, flushBrowserLogs } from '../../lib/helpers/browser'
import { createTest, html } from '../../lib/framework'
import { flushEvents } from '../../lib/helpers/flushEvents'

describe('bridge present', () => {
  createTest('send action')
    .withRum({ trackInteractions: true, enableExperimentalFeatures: ['event-bridge'] })
    .withEventBridge()
    .withBody(
      html`
        <button>click me</button>
        <script>
          const btn = document.querySelector('button')
          btn.addEventListener('click', () => {
            btn.setAttribute('data-clicked', 'true')
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
    .withRum({ enableExperimentalFeatures: ['event-bridge'] })
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
    .withRum({ enableExperimentalFeatures: ['event-bridge'] })
    .withEventBridge()
    .run(async ({ serverEvents, bridgeEvents }) => {
      await flushEvents()

      expect(serverEvents.rumResources.length).toEqual(0)
      expect(bridgeEvents.rumResources.length).toBeGreaterThan(0)
    })

  createTest('send view')
    .withRum({ enableExperimentalFeatures: ['event-bridge'] })
    .withEventBridge()
    .run(async ({ serverEvents, bridgeEvents }) => {
      await flushEvents()

      expect(serverEvents.rumViews.length).toEqual(0)
      expect(bridgeEvents.rumViews.length).toBeGreaterThan(0)
    })
})
