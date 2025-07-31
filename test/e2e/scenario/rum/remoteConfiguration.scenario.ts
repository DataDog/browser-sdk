import { test, expect } from '@playwright/test'
import { createTest, html } from '../../lib/framework'

test.describe('remote configuration', () => {
  createTest('should be fetched and applied')
    .withRum({
      sessionSampleRate: 100,
      remoteConfigurationId: 'e2e',
    })
    .withRemoteConfiguration({
      rum: { applicationId: 'e2e', sessionSampleRate: 1 },
    })
    .run(async ({ page }) => {
      const initConfiguration = await page.evaluate(() => window.DD_RUM!.getInitConfiguration()!)
      expect(initConfiguration.sessionSampleRate).toBe(1)
    })

  createTest('should resolve an option value from a cookie')
    .withRum({
      remoteConfigurationId: 'e2e',
    })
    .withRemoteConfiguration({
      rum: { applicationId: 'e2e', version: { rcSerializedType: 'dynamic', strategy: 'cookie', name: 'e2e_rc' } },
    })
    .withBody(html`
      <script>
        document.cookie = 'e2e_rc=my-version;'
      </script>
    `)
    .run(async ({ page }) => {
      const initConfiguration = await page.evaluate(() => window.DD_RUM!.getInitConfiguration()!)
      expect(initConfiguration.version).toBe('my-version')
    })
})
