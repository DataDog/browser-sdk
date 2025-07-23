import { test, expect } from '@playwright/test'
import { createTest } from '../../lib/framework'

test.describe('remote configuration', () => {
  createTest('should be fetched and applied')
    .withRum({
      sessionSampleRate: 100,
      remoteConfigurationId: 'e2e',
    })
    .withRemoteConfig({
      rum: { applicationId: 'e2e', sessionSampleRate: 1 },
    })
    .run(async ({ page }) => {
      const initConfiguration = await page.evaluate(() => window.DD_RUM!.getInitConfiguration()!)
      expect(initConfiguration.sessionSampleRate).toBe(1)
    })
})
