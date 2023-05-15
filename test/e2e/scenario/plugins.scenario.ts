import type { RumEvent } from '@datadog/browser-rum-core/src'
import { createTest, bundleSetup, flushEvents } from '../lib/framework'
import { browserExecute } from '../lib/helpers/browser'

describe('plugins', () => {
  createTest('send errors for logs')
    .withSetup(bundleSetup)
    .withRum()
    .run(async ({ serverEvents }) => {
      await browserExecute(() => {
        class TestPlugin {
          beforeSend(event: RumEvent) {
            event.context!.foo = 'bar'
          }
        }
        window.DD_RUM!.registerPlugins(new TestPlugin())
        window.DD_RUM!.addAction('foo')
      })
      await flushEvents()
      const actionEvents = serverEvents.rumActions
      expect(actionEvents.length).toBe(1)
      expect(actionEvents[0].context!.foo).toBe('bar')
    })
})
