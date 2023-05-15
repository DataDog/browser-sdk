import type { RumEvent } from '@datadog/browser-rum-core/src'
import type { LogsEvent } from '@datadog/browser-logs/src/logsEvent.types'
import { createTest, bundleSetup, flushEvents } from '../lib/framework'
import { browserExecute } from '../lib/helpers/browser'

describe('plugins', () => {
  createTest('rum beforeSend')
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

  createTest('logs beforeSend')
    .withSetup(bundleSetup)
    .withLogs()
    .run(async ({ serverEvents }) => {
      await browserExecute(() => {
        class TestPlugin {
          beforeSend(event: LogsEvent) {
            event.foo = 'bar'
          }
        }
        window.DD_LOGS!.registerPlugins(new TestPlugin())
        window.DD_LOGS!.logger.log('foo')
      })
      await flushEvents()
      const logs = serverEvents.logs
      expect(logs.length).toBe(1)
      expect(logs[0].foo).toBe('bar')
    })
})
