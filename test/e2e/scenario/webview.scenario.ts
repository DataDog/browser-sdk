import { expect } from '@playwright/test'
import { test } from '../android/webviewFixture'
import { createTest } from '../lib/framework'

test.describe('webview', () => {
  createTest('send RUM events through the bridge')
    .withRum()
    .withEventBridge()
    .withFixture(test)
    .run(async ({ flushEvents, intakeRegistry }) => {
      await flushEvents()

      expect(intakeRegistry.rumViewEvents.length).toBeGreaterThan(0)
      expect(intakeRegistry.hasOnlyBridgeRequests).toBe(true)
    })

  createTest('send logs through the bridge')
    .withLogs()
    .withEventBridge()
    .withFixture(test)
    .run(async ({ flushEvents, intakeRegistry, page }) => {
      await page.evaluate(() => {
        window.DD_LOGS!.logger.log('hello from webview')
      })
      await flushEvents()

      expect(intakeRegistry.logsEvents).toHaveLength(1)
      expect(intakeRegistry.logsEvents[0].message).toBe('hello from webview')
      expect(intakeRegistry.hasOnlyBridgeRequests).toBe(true)
    })
})
