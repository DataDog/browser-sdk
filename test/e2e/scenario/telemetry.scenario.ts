import { test, expect } from '@playwright/test'
import { createTest, html } from '../lib/framework'

test.describe('telemetry', () => {
  createTest('send errors for logs')
    .withLogs()
    .run(async ({ intakeRegistry, page, flushEvents }) => {
      await page.evaluate(() => {
        const context = {
          get foo() {
            throw new window.Error('expected error')
          },
        }
        window.DD_LOGS!.logger.log('hop', context as any)
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
    .withRum()
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      await page.evaluate(() => {
        const context = {
          get foo() {
            throw new window.Error('expected error')
          },
        }
        window.DD_RUM!.addAction('hop', context as any)
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
    .withRum()
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      await page.evaluate(() => {
        window.DD_RUM!.addAction('foo')
      })

      await flushEvents()
      expect(intakeRegistry.telemetryUsageEvents).toHaveLength(2)
      const event = intakeRegistry.telemetryUsageEvents[1] // first event is 'set-global-context' done in pageSetup.ts
      expect(event.service).toEqual('browser-rum-sdk')
      expect(event.telemetry.usage.feature).toEqual('add-action')
    })

  createTest('send usage telemetry for logs')
    .withLogs()
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      await page.evaluate(() => {
        window.DD_LOGS!.setTrackingConsent('granted')
      })

      await flushEvents()
      expect(intakeRegistry.telemetryUsageEvents).toHaveLength(1)
      const event = intakeRegistry.telemetryUsageEvents[0]
      expect(event.service).toEqual('browser-logs-sdk')
      expect(event.telemetry.usage.feature).toEqual('set-tracking-consent')
    })

  test.describe('collect errors related to session initialization', () => {
    // Test for RUM and Logs separately, because using both at the same time via NPM triggers
    // different errors (because both SDKs are sharing the same cookie store `operationBuffer`
    // queue). This could be revisited after properly fixing incident-39238.

    const DENY_SESSION_COOKIE_ACCESS = html`
      <script>
        // Make Logs and RUM session initialization fail by denying cookie access
        const originalDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')
        Object.defineProperty(Document.prototype, 'cookie', {
          get: () => originalDescriptor.get.call(document),
          set: (value) => {
            if (value.includes('_dd_s=')) {
              throw new Error('expected error')
            }
            originalDescriptor.set.call(document, value)
          },
        })
      </script>
    `

    createTest('logs')
      .withHead(DENY_SESSION_COOKIE_ACCESS)
      .withLogs()
      .run(async ({ intakeRegistry, flushEvents }) => {
        await flushEvents()
        expect(intakeRegistry.telemetryErrorEvents).toHaveLength(1)
        const error = intakeRegistry.telemetryErrorEvents[0]
        expect(error.service).toEqual('browser-logs-sdk')
        expect(error.telemetry.message).toBe('expected error')
        expect(error.telemetry.error!.kind).toBe('Error')
        expect(error.telemetry.status).toBe('error')
        intakeRegistry.empty()
      })

    createTest('rum')
      .withHead(DENY_SESSION_COOKIE_ACCESS)
      .withRum()
      .run(async ({ intakeRegistry, flushEvents }) => {
        await flushEvents()
        expect(intakeRegistry.telemetryErrorEvents).toHaveLength(1)
        const error = intakeRegistry.telemetryErrorEvents[0]
        expect(error.service).toEqual('browser-rum-sdk')
        expect(error.telemetry.message).toBe('expected error')
        expect(error.telemetry.error!.kind).toBe('Error')
        expect(error.telemetry.status).toBe('error')
        intakeRegistry.empty()
      })
  })
})
