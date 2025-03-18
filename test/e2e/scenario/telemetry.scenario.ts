import { test, expect } from '@playwright/test'
import { bundleSetup, createTest } from '../lib/framework'

test.describe('telemetry', () => {
  createTest('send errors for logs')
    .withSetup(bundleSetup)
    .withLogs()
    .run(async ({ intakeRegistry, page, flushEvents }) => {
      await page.evaluate(() => {
        const context = {
          get foo() {
            throw new window.Error('expected error')
          },
        }
        window.FC_LOGS!.logger.log('hop', context as any)
      })
      await flushEvents()
      expect(intakeRegistry.telemetryErrorEvents).toHaveLength(1)
      const event = intakeRegistry.telemetryErrorEvents[0]
      expect(event.service).toEqual('browser-logs-sdk')
      expect(event.telemetry.message).toBe('expected error')
      expect(event.telemetry.error!.kind).toBe('Error')
      expect(event.telemetry.status).toBe('error')
      intakeRegistry.empty()
    })

  createTest('send errors for RUM')
    .withSetup(bundleSetup)
    .withRum()
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      await page.evaluate(() => {
        const context = {
          get foo() {
            throw new window.Error('expected error')
          },
        }
        window.FC_RUM!.addAction('hop', context as any)
      })
      await flushEvents()
      expect(intakeRegistry.telemetryErrorEvents).toHaveLength(1)
      const event = intakeRegistry.telemetryErrorEvents[0]
      expect(event.service).toEqual('browser-rum-sdk')
      expect(event.telemetry.message).toBe('expected error')
      expect(event.telemetry.error!.kind).toBe('Error')
      expect(event.telemetry.status).toBe('error')
      intakeRegistry.empty()
    })

  createTest('send init configuration for logs')
    .withSetup(bundleSetup)
    .withLogs({
      forwardErrorsToLogs: true,
    })
    .run(async ({ intakeRegistry, flushEvents }) => {
      await flushEvents()
      expect(intakeRegistry.telemetryConfigurationEvents).toHaveLength(1)
      const event = intakeRegistry.telemetryConfigurationEvents[0]
      expect(event.service).toEqual('browser-logs-sdk')
      expect(event.telemetry.configuration.forward_errors_to_logs).toEqual(true)
    })

  createTest('send init configuration for RUM')
    .withSetup(bundleSetup)
    .withRum({
      trackUserInteractions: true,
    })
    .run(async ({ intakeRegistry, flushEvents }) => {
      await flushEvents()
      expect(intakeRegistry.telemetryConfigurationEvents).toHaveLength(1)
      const event = intakeRegistry.telemetryConfigurationEvents[0]
      expect(event.service).toEqual('browser-rum-sdk')
      expect(event.telemetry.configuration.track_user_interactions).toEqual(true)
    })

  createTest('send usage telemetry for RUM')
    .withSetup(bundleSetup)
    .withRum()
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      await page.evaluate(() => {
        window.FC_RUM!.addAction('foo')
      })

      await flushEvents()
      expect(intakeRegistry.telemetryUsageEvents).toHaveLength(2)
      const event = intakeRegistry.telemetryUsageEvents[1] // first event is 'set-global-context' done in pageSetup.ts
      expect(event.service).toEqual('browser-rum-sdk')
      expect(event.telemetry.usage.feature).toEqual('add-action')
    })

  createTest('send usage telemetry for logs')
    .withSetup(bundleSetup)
    .withLogs()
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      await page.evaluate(() => {
        window.FC_LOGS!.setTrackingConsent('granted')
      })

      await flushEvents()
      expect(intakeRegistry.telemetryUsageEvents).toHaveLength(1)
      const event = intakeRegistry.telemetryUsageEvents[0]
      expect(event.service).toEqual('browser-logs-sdk')
      expect(event.telemetry.usage.feature).toEqual('set-tracking-consent')
    })
})
