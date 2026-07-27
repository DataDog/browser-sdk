import type { Page } from '@playwright/test'
import { test, expect } from '@playwright/test'
import { createTest } from '../lib/framework'

const RC_ID = 'e2e'

test.describe('remote configuration', () => {
  createTest('should issue a single fetch when both RUM and Logs share the same remote config ID')
    .withRum({ remoteConfigurationId: RC_ID, sessionSampleRate: 100 })
    .withLogs({ remoteConfigurationId: RC_ID })
    .withRemoteConfiguration({
      rum: { applicationId: RC_ID, sessionSampleRate: 100 },
      logs: { forwardErrorsToLogs: true },
    })
    .run(async ({ page }) => {
      await waitForRumRemoteConfigurationApplied(page)

      const configRequestCount = await page.evaluate(
        () => window.performance.getEntriesByType('resource').filter((e) => e.name.endsWith('/config')).length
      )

      expect(configRequestCount).toBe(1)
    })
})

async function waitForRumRemoteConfigurationApplied(page: Page) {
  await page.waitForFunction((rcId) => window.DD_RUM?.getInitConfiguration()?.applicationId === rcId, RC_ID, {
    timeout: 10000,
  })
}
