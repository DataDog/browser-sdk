import type { TelemetryErrorEvent } from '@datadog/browser-core'
import { bundleSetup, createTest, flushEvents } from '../lib/framework'
import { browserExecute } from '../lib/helpers/browser'

describe('telemetry', () => {
  createTest('send errors for logs')
    .withSetup(bundleSetup)
    .withLogs()
    .run(async ({ serverEvents }) => {
      await browserExecute(() => {
        const context = {
          get foo() {
            throw new window.Error('bar')
          },
        }
        window.DD_LOGS!.logger.log('hop', context as any)
      })
      await flushEvents()

      // get the last telemetry event because telemetry configuration may have been collected first
      const event = serverEvents.telemetry[serverEvents.telemetry.length - 1] as TelemetryErrorEvent
      expect(event.telemetry.message).toBe('bar')
      expect(event.telemetry.error!.kind).toBe('Error')
      expect(event.telemetry.status).toBe('error')
      serverEvents.empty()
    })

  createTest('send errors for RUM')
    .withSetup(bundleSetup)
    .withRum()
    .run(async ({ serverEvents }) => {
      await browserExecute(() => {
        const context = {
          get foo() {
            throw new window.Error('bar')
          },
        }
        window.DD_RUM!.addAction('hop', context as any)
      })
      await flushEvents()

      // get the last telemetry event because telemetry configuration may have been collected first
      const event = serverEvents.telemetry[serverEvents.telemetry.length - 1] as TelemetryErrorEvent
      expect(event.telemetry.message).toBe('bar')
      expect(event.telemetry.error!.kind).toBe('Error')
      expect(event.telemetry.status).toBe('error')
      serverEvents.empty()
    })
})
