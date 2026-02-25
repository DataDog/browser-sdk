import type { Page } from '@playwright/test'
import { test, expect } from '@playwright/test'
import { createTest, html } from '../../lib/framework'

const RC_APP_ID = 'e2e'

test.describe('remote configuration', () => {
  createTest('should be fetched and applied')
    .withRum({
      sessionSampleRate: 100,
      remoteConfigurationId: 'e2e',
    })
    .withRemoteConfiguration({
      rum: { applicationId: RC_APP_ID, sessionSampleRate: 1 },
    })
    .run(async ({ page }) => {
      await waitForRemoteConfigurationToBeApplied(page)
      const initConfiguration = await page.evaluate(() => window.DD_RUM!.getInitConfiguration()!)
      expect(initConfiguration.sessionSampleRate).toBe(1)
    })

  createTest('should resolve an option value from a cookie')
    .withRum({
      remoteConfigurationId: 'e2e',
    })
    .withRemoteConfiguration({
      rum: { applicationId: RC_APP_ID, version: { rcSerializedType: 'dynamic', strategy: 'cookie', name: 'e2e_rc' } },
    })
    .withBody(html`
      <script>
        document.cookie = 'e2e_rc=my-version;'
      </script>
    `)
    .run(async ({ page }) => {
      await waitForRemoteConfigurationToBeApplied(page)
      const initConfiguration = await page.evaluate(() => window.DD_RUM!.getInitConfiguration()!)
      expect(initConfiguration.version).toBe('my-version')
    })

  createTest('should resolve an option value from an element content')
    .withRum({
      remoteConfigurationId: 'e2e',
    })
    .withRemoteConfiguration({
      rum: {
        applicationId: RC_APP_ID,
        version: { rcSerializedType: 'dynamic', strategy: 'dom', selector: '#version' },
      },
    })
    .withBody(html`<span id="version">123</span>`)
    .run(async ({ page }) => {
      await waitForRemoteConfigurationToBeApplied(page)
      const initConfiguration = await page.evaluate(() => window.DD_RUM!.getInitConfiguration()!)
      expect(initConfiguration.version).toBe('123')
    })

  createTest('should resolve an option value from an element attribute')
    .withRum({
      remoteConfigurationId: 'e2e',
    })
    .withRemoteConfiguration({
      rum: {
        applicationId: RC_APP_ID,
        version: { rcSerializedType: 'dynamic', strategy: 'dom', selector: '#version', attribute: 'data-version' },
      },
    })
    .withBody(html`<span id="version" data-version="123"></span>`)
    .run(async ({ page }) => {
      await waitForRemoteConfigurationToBeApplied(page)
      const initConfiguration = await page.evaluate(() => window.DD_RUM!.getInitConfiguration()!)
      expect(initConfiguration.version).toBe('123')
    })

  createTest('should resolve an option value from js variable')
    .withRum({
      remoteConfigurationId: 'e2e',
    })
    .withRemoteConfiguration({
      rum: {
        applicationId: 'e2e',
        version: { rcSerializedType: 'dynamic', strategy: 'js', path: 'dataLayer.version' },
      },
    })
    .withBody(html`
      <script>
        dataLayer = {
          version: 'js-version',
        }
      </script>
    `)
    .run(async ({ page }) => {
      await waitForRemoteConfigurationToBeApplied(page)
      const initConfiguration = await page.evaluate(() => window.DD_RUM!.getInitConfiguration()!)
      expect(initConfiguration.version).toBe('js-version')
    })

  createTest('should resolve an option value from localStorage')
    .withRum({
      remoteConfigurationId: 'e2e',
    })
    .withRemoteConfiguration({
      rum: {
        applicationId: 'e2e',
        version: { rcSerializedType: 'dynamic', strategy: 'localStorage', key: 'dd_app_version' },
      },
    })
    .withBody(html`
      <script>
        localStorage.setItem('dd_app_version', 'localStorage-version')
      </script>
    `)
    .run(async ({ page }) => {
      await waitForRemoteConfigurationToBeApplied(page)
      const initConfiguration = await page.evaluate(() => window.DD_RUM!.getInitConfiguration()!)
      expect(initConfiguration.version).toBe('localStorage-version')
    })

  createTest('should resolve an option value from localStorage with an extractor')
    .withRum({
      remoteConfigurationId: 'e2e',
    })
    .withRemoteConfiguration({
      rum: {
        applicationId: 'e2e',
        version: {
          rcSerializedType: 'dynamic',
          strategy: 'localStorage',
          key: 'dd_app_version',
          extractor: { rcSerializedType: 'regex', value: '\\d+\\.\\d+\\.\\d+' },
        },
      },
    })
    .withBody(html`
      <script>
        localStorage.setItem('dd_app_version', 'version-1.2.3-beta')
      </script>
    `)
    .run(async ({ page }) => {
      await waitForRemoteConfigurationToBeApplied(page)
      const initConfiguration = await page.evaluate(() => window.DD_RUM!.getInitConfiguration()!)
      expect(initConfiguration.version).toBe('1.2.3')
    })

  createTest('should resolve to undefined when localStorage key is missing')
    .withRum({
      remoteConfigurationId: 'e2e',
    })
    .withRemoteConfiguration({
      rum: {
        applicationId: 'e2e',
        version: { rcSerializedType: 'dynamic', strategy: 'localStorage', key: 'non_existent_key' },
      },
    })
    .run(async ({ page }) => {
      await waitForRemoteConfigurationToBeApplied(page)
      const initConfiguration = await page.evaluate(() => window.DD_RUM!.getInitConfiguration()!)
      expect(initConfiguration.version).toBeUndefined()
    })

  createTest('should handle localStorage access failure gracefully')
    .withRum({
      remoteConfigurationId: 'e2e',
    })
    .withRemoteConfiguration({
      rum: {
        applicationId: 'e2e',
        version: { rcSerializedType: 'dynamic', strategy: 'localStorage', key: 'dd_app_version' },
      },
    })
    .withBody(html`
      <script>
        Object.defineProperty(window, 'localStorage', {
          get: function () {
            throw new Error('localStorage is not available')
          },
          configurable: true,
        })
      </script>
    `)
    .run(async ({ page }) => {
      await waitForRemoteConfigurationToBeApplied(page)
      const initConfiguration = await page.evaluate(() => window.DD_RUM!.getInitConfiguration()!)
      expect(initConfiguration.version).toBeUndefined()
    })

  createTest('should resolve user context')
    .withRum({
      remoteConfigurationId: 'e2e',
    })
    .withRemoteConfiguration({
      rum: {
        applicationId: RC_APP_ID,
        user: [{ key: 'id', value: { rcSerializedType: 'dynamic', strategy: 'cookie', name: 'e2e_rc' } }],
      },
    })
    .withBody(html`
      <script>
        document.cookie = 'e2e_rc=my-user-id;'
      </script>
    `)
    .run(async ({ page }) => {
      await waitForRemoteConfigurationToBeApplied(page)
      const user = await page.evaluate(() => window.DD_RUM!.getUser())
      expect(user.id).toBe('my-user-id')
    })

  createTest('should resolve global context')
    .withRum({
      remoteConfigurationId: 'e2e',
    })
    .withRemoteConfiguration({
      rum: {
        applicationId: RC_APP_ID,
        context: [
          {
            key: 'foo',
            value: { rcSerializedType: 'dynamic', strategy: 'cookie', name: 'e2e_rc' },
          },
        ],
      },
    })
    .withBody(html`
      <script>
        document.cookie = 'e2e_rc=bar;'
      </script>
    `)
    .run(async ({ page }) => {
      await waitForRemoteConfigurationToBeApplied(page)
      const globalContext = await page.evaluate(() => window.DD_RUM!.getGlobalContext())
      expect(globalContext.foo).toEqual('bar')
    })
})

async function waitForRemoteConfigurationToBeApplied(page: Page) {
  for (let i = 0; i < 20; i++) {
    const initConfiguration = await page.evaluate(() => window.DD_RUM!.getInitConfiguration()!)
    if (initConfiguration.applicationId === RC_APP_ID) {
      break
    }
    console.log('wait for remote configuration to be applied')
    await page.waitForTimeout(100)
  }
}
