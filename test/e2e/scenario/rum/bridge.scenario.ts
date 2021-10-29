import { browserExecute, flushBrowserLogs } from '../../lib/helpers/browser'
import { createTest, html } from '../../lib/framework'
import { flushEvents } from '../../lib/helpers/sdk'

describe('bridge present', () => {
  createTest('forward action to the bridge')
    .withRum({ trackInteractions: true, enableExperimentalFeatures: ['event-bridge'] })
    .withBridge()
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
    .run(async ({ events, bridgeEvents }) => {
      const button = await $('button')
      await button.click()
      await flushEvents(bridgeEvents)

      expect(events.rumActions.length).toBe(0)
      expect(bridgeEvents.rumActions.length).toBe(1)
    })

  createTest('forward error to the bridge')
    .withRum({ enableExperimentalFeatures: ['event-bridge'] })
    .withBridge()
    .run(async ({ events, bridgeEvents }) => {
      await browserExecute(() => {
        console.error('oh snap')
      })

      await flushBrowserLogs()
      await flushEvents(bridgeEvents)

      expect(events.rumErrors.length).toBe(0)
      expect(bridgeEvents.rumErrors.length).toBeGreaterThan(0)
    })

  createTest('forward resources to the bridge')
    .withRum({ enableExperimentalFeatures: ['event-bridge'] })
    .withBridge()
    .run(async ({ events, bridgeEvents }) => {
      await flushEvents(bridgeEvents)

      expect(events.rumResources.length).toEqual(0)
      expect(bridgeEvents.rumResources.length).toBeGreaterThan(0)
    })

  createTest('forward view to the bridge')
    .withRum({ enableExperimentalFeatures: ['event-bridge'] })
    .withBridge()
    .run(async ({ events, bridgeEvents }) => {
      await flushEvents(bridgeEvents)

      expect(events.rumViews.length).toEqual(0)
      expect(bridgeEvents.rumViews.length).toBeGreaterThan(0)
    })
})
