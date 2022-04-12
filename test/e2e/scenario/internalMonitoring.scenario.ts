import type { TelemetryErrorEvent } from '@datadog/browser-core/src/domain/internalMonitoring/telemetryEvent.types'
import { bundleSetup, createTest } from '../lib/framework'
import { browserExecute } from '../lib/helpers/browser'
import { flushEvents } from '../lib/helpers/flushEvents'

describe('internal monitoring', () => {
  createTest('send errors for logs')
    .withSetup(bundleSetup)
    .withLogs({
      internalMonitoringApiKey: 'xxx',
    })
    .run(async ({ serverEvents }) => {
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
      expect(serverEvents.internalMonitoring.length).toBe(1)
      const event = serverEvents.internalMonitoring[0]
      expect(event.message).toBe('bar')
      expect(event.error.kind).toBe('Error')
      expect(event.status).toBe('error')
      serverEvents.empty()
    })

  createTest('send errors for RUM')
    .withSetup(bundleSetup)
    .withRum({
      internalMonitoringApiKey: 'xxx',
    })
    .run(async ({ serverEvents }) => {
      await browserExecute(() => {
        const context = {
          get foo() {
            throw new window.Error('bar')
          },
        }
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        window.DD_RUM!.addAction('hop', context as any)
      })
      await flushEvents()
      expect(serverEvents.internalMonitoring.length).toBe(1)
      const event = serverEvents.internalMonitoring[0]
      expect(event.message).toBe('bar')
      expect(event.error.kind).toBe('Error')
      expect(event.status).toBe('error')
      serverEvents.empty()
    })
})

describe('telemetry', () => {
  createTest('send errors for logs')
    .withSetup(bundleSetup)
    .withLogs({
      enableExperimentalFeatures: ['telemetry'],
    })
    .run(async ({ serverEvents }) => {
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
      expect(serverEvents.telemetry.length).toBe(1)
      const event = serverEvents.telemetry[0] as TelemetryErrorEvent
      expect(event.telemetry.message).toBe('bar')
      expect(event.telemetry.error!.kind).toBe('Error')
      expect(event.telemetry.status).toBe('error')
      serverEvents.empty()
    })

  createTest('send errors for RUM')
    .withSetup(bundleSetup)
    .withRum({
      enableExperimentalFeatures: ['telemetry'],
    })
    .run(async ({ serverEvents }) => {
      await browserExecute(() => {
        const context = {
          get foo() {
            throw new window.Error('bar')
          },
        }
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        window.DD_RUM!.addAction('hop', context as any)
      })
      await flushEvents()
      expect(serverEvents.telemetry.length).toBe(1)
      const event = serverEvents.telemetry[0] as TelemetryErrorEvent
      expect(event.telemetry.message).toBe('bar')
      expect(event.telemetry.error!.kind).toBe('Error')
      expect(event.telemetry.status).toBe('error')
      serverEvents.empty()
    })
})
