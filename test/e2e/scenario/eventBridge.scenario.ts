import { browserExecute, flushBrowserLogs } from '../lib/helpers/browser'
import type { IntakeRegistry } from '../lib/framework'
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
      await flushEvents()

      expect(intakeRegistry.rumActionEvents.length).toBe(1)
      expectAllRequestsComeFromBridge(intakeRegistry)
    })

  createTest('send error')
    .withRum()
    .withEventBridge()
    .run(async ({ intakeRegistry }) => {
      await browserExecute(() => {
        console.error('oh snap')
      })

      await flushBrowserLogs()
      await flushEvents()

      expect(intakeRegistry.rumErrorEvents.length).toBe(1)
      expectAllRequestsComeFromBridge(intakeRegistry)
    })

  createTest('send resource')
    .withRum()
    .withEventBridge()
    .run(async ({ intakeRegistry }) => {
      await flushEvents()

      expect(intakeRegistry.rumResourceEvents.length).toBeGreaterThan(0)
      expectAllRequestsComeFromBridge(intakeRegistry)
    })

  createTest('send view')
    .withRum()
    .withEventBridge()
    .run(async ({ intakeRegistry }) => {
      await flushEvents()

      expect(intakeRegistry.rumViewEvents.length).toBeGreaterThan(0)
      expectAllRequestsComeFromBridge(intakeRegistry)
    })

  createTest('forward telemetry to the bridge')
    .withLogs()
    .withEventBridge()
    .run(async ({ intakeRegistry }) => {
      await browserExecute(() => {
        const context = {
          get foo() {
            throw new window.Error('bar')
          },
        }
        window.DD_LOGS!.logger.log('hop', context as any)
      })

      await flushEvents()
      expect(intakeRegistry.telemetryErrorEvents.length).toBe(1)
      expectAllRequestsComeFromBridge(intakeRegistry)
      intakeRegistry.empty()
    })

  createTest('forward logs to the bridge')
    .withLogs()
    .withEventBridge()
    .run(async ({ intakeRegistry }) => {
      await browserExecute(() => {
        window.DD_LOGS!.logger.log('hello')
      })
      await flushEvents()

      expect(intakeRegistry.logsEvents.length).toBe(1)
      expectAllRequestsComeFromBridge(intakeRegistry)
    })
})

function expectAllRequestsComeFromBridge(intakeRegistry: IntakeRegistry) {
  expect(intakeRegistry.requests.every((request) => request.isBridge)).toBe(true)
}
