// Types only, not part of the public types: no runtime or consumer dependency
// eslint-disable-next-line local-rules/enforce-prod-deps-imports
import type { ExtensionApi, ShopifyGlobal } from '@shopify/web-pixels-extension'
import { globalObject } from '@datadog/js-core/util'
import { display } from '@datadog/browser-core'
import type { RumInitConfiguration, RumPlugin } from '@datadog/browser-rum-core'
import { initShopifyBindings } from './shopifyBindings'
import { createShopifyCookieAccess } from './shopifyCookieAccess'

/**
 * Runs the RUM SDK in the Datadog Shopify app Web Pixel extension (a Web Worker). Registers the
 * pixel with Shopify, reads the RUM configuration from the `rumConfig` pixel setting, and shares
 * the storefront session through Shopify `browser.cookie`.
 *
 * `init` must be called synchronously when the pixel script is evaluated, so the pixel is
 * registered in time.
 */
export function shopifyAppPixelPlugin(): RumPlugin {
  return {
    name: 'shopify-app-pixel',
    onInit({ initConfiguration, publicApi, setSessionCookieAccess }) {
      const shopify = (globalObject as { shopify?: ShopifyGlobal }).shopify
      if (!shopify) {
        // Not in a Shopify Web Pixel: run with the init configuration and a memory session
        forceWorkerConfiguration(initConfiguration)
        initConfiguration.sessionPersistence = 'memory'
        return
      }

      return new Promise((resolve) => {
        // What `register` from @shopify/web-pixels-extension does
        shopify.extend('WebPixel::Render', (api: ExtensionApi) => {
          const rumConfig = parseRumConfig(api.settings.rumConfig)
          if (!rumConfig) {
            resolve(false)
            return
          }
          Object.assign(initConfiguration, rumConfig)
          forceWorkerConfiguration(initConfiguration)

          // Views are started from Shopify `page_viewed` events
          initShopifyBindings(publicApi, api.analytics)

          // Share the storefront session: read and write the `_dd_s_v2` cookie of the checkout page
          setSessionCookieAccess((cookieName, cookieOptions) =>
            createShopifyCookieAccess(api.browser.cookie, cookieName, cookieOptions)
          )
          resolve()
        })
      })
    },
  }
}

function parseRumConfig(value: unknown): Partial<RumInitConfiguration> | undefined {
  let rumConfig: unknown
  try {
    rumConfig = JSON.parse(value as string)
  } catch {
    // Reported below
  }
  if (!rumConfig || typeof rumConfig !== 'object' || Array.isArray(rumConfig)) {
    display.error('Shopify settings.rumConfig must contain a JSON object')
    return
  }
  return rumConfig
}

function forceWorkerConfiguration(initConfiguration: RumInitConfiguration) {
  initConfiguration.trackViewsManually = true // Views are started from Shopify `page_viewed` events
  initConfiguration.trackUserInteractions = false // The worker has no DOM to interact with
  initConfiguration.trackResources = false // The worker only sees its own requests
  initConfiguration.trackLongTasks = false // The worker does not run on the checkout main thread
  initConfiguration.trackAutomaticViewMetrics = false // The worker has no page to measure
  initConfiguration.sessionReplaySampleRate = 0 // Session Replay needs a DOM
  initConfiguration.profilingSampleRate = 0 // Profiling does not see the checkout main thread
  // The session cookie is accessed through Shopify `browser.cookie`. Falls back to a new session if
  // it's unavailable, ex: with `trackSessionAcrossSubdomains`, which needs `document.cookie`.
  initConfiguration.sessionPersistence = ['cookie', 'memory']
}
