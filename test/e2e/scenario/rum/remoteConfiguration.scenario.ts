import type { Page } from '@playwright/test'
import type { RemoteConfiguration } from '@datadog/browser-rum-core'
import { test, expect } from '@playwright/test'
import { createTest, html, waitForServersIdle } from '../../lib/framework'

const RC_APP_ID = 'e2e'
const CACHE_KEY = `dd_rc_${RC_APP_ID}`

test.describe('remote configuration', () => {
  createTest('should be fetched on first load, cached, and applied after reload')
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
      expect(initConfiguration.applicationId).toBe(RC_APP_ID)
      expect(initConfiguration.sessionSampleRate).toBe(1)
    })

  createTest('should preserve init configuration on first load and populate cache from background fetch')
    .withRum({
      remoteConfigurationId: 'e2e',
    })
    .withRemoteConfiguration({
      rum: { applicationId: RC_APP_ID, sessionSampleRate: 1 },
    })
    .run(async ({ page }) => {
      const initConfiguration = await page.evaluate(() => window.DD_RUM!.getInitConfiguration()!)
      expect(initConfiguration.applicationId).not.toBe(RC_APP_ID)

      await page.waitForFunction((key) => localStorage.getItem(key) !== null, CACHE_KEY)
      const stored = await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)!) as { version: number; config: object },
        CACHE_KEY
      )
      expect(stored.version).toBe(1)
      expect(stored.config).toEqual({ applicationId: RC_APP_ID, sessionSampleRate: 1 })
    })

  createTest('should resolve an option value from a cookie')
    .withRum({ remoteConfigurationId: 'e2e' })
    .withRemoteConfiguration({
      rum: { applicationId: RC_APP_ID, version: { rcSerializedType: 'dynamic', strategy: 'cookie', name: 'e2e_rc' } },
    })
    .withHead(html`
      ${seedCache({
        rum: { applicationId: RC_APP_ID, version: { rcSerializedType: 'dynamic', strategy: 'cookie', name: 'e2e_rc' } },
      })}
      <script>
        document.cookie = 'e2e_rc=my-version;'
      </script>
    `)
    .run(async ({ page }) => {
      const initConfiguration = await page.evaluate(() => window.DD_RUM!.getInitConfiguration()!)
      expect(initConfiguration.version).toBe('my-version')
    })

  createTest('should resolve an option value from an element content')
    .withRum({ remoteConfigurationId: 'e2e' })
    .withRemoteConfiguration({
      rum: {
        applicationId: RC_APP_ID,
        version: { rcSerializedType: 'dynamic', strategy: 'dom', selector: '#version' },
      },
    })
    .withHead(html`
      ${seedCache({
        rum: { applicationId: RC_APP_ID, version: { rcSerializedType: 'dynamic', strategy: 'dom', selector: '#version' } },
      })}
      <span id="version">123</span>
    `)
    .run(async ({ page }) => {
      const initConfiguration = await page.evaluate(() => window.DD_RUM!.getInitConfiguration()!)
      expect(initConfiguration.version).toBe('123')
    })

  createTest('should resolve an option value from an element attribute')
    .withRum({ remoteConfigurationId: 'e2e' })
    .withRemoteConfiguration({
      rum: {
        applicationId: RC_APP_ID,
        version: { rcSerializedType: 'dynamic', strategy: 'dom', selector: '#version', attribute: 'data-version' },
      },
    })
    .withHead(html`
      ${seedCache({
        rum: {
          applicationId: RC_APP_ID,
          version: { rcSerializedType: 'dynamic', strategy: 'dom', selector: '#version', attribute: 'data-version' },
        },
      })}
      <span id="version" data-version="123"></span>
    `)
    .run(async ({ page }) => {
      const initConfiguration = await page.evaluate(() => window.DD_RUM!.getInitConfiguration()!)
      expect(initConfiguration.version).toBe('123')
    })

  createTest('should resolve an option value from js variable')
    .withRum({ remoteConfigurationId: 'e2e' })
    .withRemoteConfiguration({
      rum: {
        applicationId: 'e2e',
        version: { rcSerializedType: 'dynamic', strategy: 'js', path: 'dataLayer.version' },
      },
    })
    .withHead(html`
      ${seedCache({
        rum: {
          applicationId: 'e2e',
          version: { rcSerializedType: 'dynamic', strategy: 'js', path: 'dataLayer.version' },
        },
      })}
      <script>
        window.dataLayer = { version: 'js-version' }
      </script>
    `)
    .run(async ({ page }) => {
      const initConfiguration = await page.evaluate(() => window.DD_RUM!.getInitConfiguration()!)
      expect(initConfiguration.version).toBe('js-version')
    })

  createTest('should resolve an option value from localStorage')
    .withRum({ remoteConfigurationId: 'e2e' })
    .withRemoteConfiguration({
      rum: {
        applicationId: 'e2e',
        version: { rcSerializedType: 'dynamic', strategy: 'localStorage', key: 'dd_app_version' },
      },
    })
    .withHead(html`
      ${seedCache({
        rum: {
          applicationId: 'e2e',
          version: { rcSerializedType: 'dynamic', strategy: 'localStorage', key: 'dd_app_version' },
        },
      })}
      <script>
        localStorage.setItem('dd_app_version', 'localStorage-version')
      </script>
    `)
    .run(async ({ page }) => {
      const initConfiguration = await page.evaluate(() => window.DD_RUM!.getInitConfiguration()!)
      expect(initConfiguration.version).toBe('localStorage-version')
    })

  createTest('should resolve an option value from localStorage with an extractor')
    .withRum({ remoteConfigurationId: 'e2e' })
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
    .withHead(html`
      ${seedCache({
        rum: {
          applicationId: 'e2e',
          version: {
            rcSerializedType: 'dynamic',
            strategy: 'localStorage',
            key: 'dd_app_version',
            extractor: { rcSerializedType: 'regex', value: '\\d+\\.\\d+\\.\\d+' },
          },
        },
      })}
      <script>
        localStorage.setItem('dd_app_version', 'version-1.2.3-beta')
      </script>
    `)
    .run(async ({ page }) => {
      const initConfiguration = await page.evaluate(() => window.DD_RUM!.getInitConfiguration()!)
      expect(initConfiguration.version).toBe('1.2.3')
    })

  createTest('should resolve to undefined when localStorage key is missing')
    .withRum({ remoteConfigurationId: 'e2e' })
    .withRemoteConfiguration({
      rum: {
        applicationId: 'e2e',
        version: { rcSerializedType: 'dynamic', strategy: 'localStorage', key: 'non_existent_key' },
      },
    })
    .withHead(
      seedCache({
        rum: {
          applicationId: 'e2e',
          version: { rcSerializedType: 'dynamic', strategy: 'localStorage', key: 'non_existent_key' },
        },
      })
    )
    .run(async ({ page }) => {
      const initConfiguration = await page.evaluate(() => window.DD_RUM!.getInitConfiguration()!)
      expect(initConfiguration.version).toBeUndefined()
    })

  createTest('should resolve user context')
    .withRum({ remoteConfigurationId: 'e2e' })
    .withRemoteConfiguration({
      rum: {
        applicationId: RC_APP_ID,
        user: [{ key: 'id', value: { rcSerializedType: 'dynamic', strategy: 'cookie', name: 'e2e_rc' } }],
      },
    })
    .withHead(html`
      ${seedCache({
        rum: {
          applicationId: RC_APP_ID,
          user: [{ key: 'id', value: { rcSerializedType: 'dynamic', strategy: 'cookie', name: 'e2e_rc' } }],
        },
      })}
      <script>
        document.cookie = 'e2e_rc=my-user-id;'
      </script>
    `)
    .run(async ({ page }) => {
      const user = await page.evaluate(() => window.DD_RUM!.getUser())
      expect(user.id).toBe('my-user-id')
    })

  createTest('should resolve global context')
    .withRum({ remoteConfigurationId: 'e2e' })
    .withRemoteConfiguration({
      rum: {
        applicationId: RC_APP_ID,
        context: [{ key: 'foo', value: { rcSerializedType: 'dynamic', strategy: 'cookie', name: 'e2e_rc' } }],
      },
    })
    .withHead(html`
      ${seedCache({
        rum: {
          applicationId: RC_APP_ID,
          context: [{ key: 'foo', value: { rcSerializedType: 'dynamic', strategy: 'cookie', name: 'e2e_rc' } }],
        },
      })}
      <script>
        document.cookie = 'e2e_rc=bar;'
      </script>
    `)
    .run(async ({ page }) => {
      const globalContext = await page.evaluate(() => window.DD_RUM!.getGlobalContext())
      expect(globalContext.foo).toEqual('bar')
    })
})

/* Embeds a synchronous <script> that pre-populates the remote-configuration cache before the SDK
 * loads. It must run before the SDK script in <head>, so pass the returned HTML through .withHead().
 * JSON.stringify() is applied twice on purpose: the inner call serializes the cache entry, the
 * outer one wraps it as a valid JS string literal with proper escaping.
 */
function seedCache(remoteConfig: RemoteConfiguration) {
  const entry = JSON.stringify({ version: 1, config: remoteConfig.rum, fetchedAt: 1000 })
  return html`<script>
    localStorage.setItem('${CACHE_KEY}', ${JSON.stringify(entry)})
  </script>`
}

/* The background fetch on the initial page load writes the remote configuration into localStorage;
 * reloading lets the SDK pick it up synchronously on the next init().
 */
async function waitForRemoteConfigurationToBeApplied(page: Page) {
  await page.waitForFunction((key) => localStorage.getItem(key) !== null, CACHE_KEY)
  await page.reload()
  await waitForServersIdle()
}