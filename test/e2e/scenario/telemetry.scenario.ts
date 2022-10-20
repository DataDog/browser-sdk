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
      expect(serverEvents.telemetryErrors.length).toBe(1)
      const event = serverEvents.telemetryErrors[0]
      expect(event.service).toEqual('browser-logs-sdk')
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
      expect(serverEvents.telemetryErrors.length).toBe(1)
      const event = serverEvents.telemetryErrors[0]
      expect(event.service).toEqual('browser-rum-sdk')
      expect(event.telemetry.message).toBe('bar')
      expect(event.telemetry.error!.kind).toBe('Error')
      expect(event.telemetry.status).toBe('error')
      serverEvents.empty()
    })

  createTest('send init configuration for logs')
    .withSetup(bundleSetup)
    .withLogs({
      forwardErrorsToLogs: true,
    })
    .run(async ({ serverEvents }) => {
      await flushEvents()
      expect(serverEvents.telemetryConfigurations.length).toBe(1)
      const event = serverEvents.telemetryConfigurations[0]
      expect(event.service).toEqual('browser-logs-sdk')
      expect(event.telemetry.configuration.forward_errors_to_logs).toEqual(true)
    })

  createTest('send init configuration for RUM')
    .withSetup(bundleSetup)
    .withRum({
      trackInteractions: true,
    })
    .run(async ({ serverEvents }) => {
      await flushEvents()
      expect(serverEvents.telemetryConfigurations.length).toBe(1)
      const event = serverEvents.telemetryConfigurations[0]
      expect(event.service).toEqual('browser-rum-sdk')
      expect(event.telemetry.configuration.track_interactions).toEqual(true)
    })
})
