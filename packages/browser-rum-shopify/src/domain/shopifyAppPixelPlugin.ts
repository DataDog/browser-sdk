// Types only, not part of the public types: no runtime or consumer dependency
// eslint-disable-next-line local-rules/enforce-prod-deps-imports
import type { ExtensionApi, ShopifyGlobal } from '@shopify/web-pixels-extension'
import { globalObject, mockable } from '@datadog/js-core/util'
import { display } from '@datadog/browser-core'
import type { RumInitConfiguration, RumPlugin } from '@datadog/browser-rum-core'
import { setShopifyBrowserApi } from './shopifySessionStore'

/**
 * Runs the RUM SDK in the Datadog Shopify app Web Pixel extension, which Shopify runs in a Web
 * Worker. Registers the pixel with Shopify, reads the RUM configuration from the `rumConfig` pixel
 * setting, shares the storefront session through the Web Pixel `browser.cookie` API and starts
 * views from Shopify `page_viewed` events. The other worker constraints (no DOM, no view
 * metrics…) are forced on the configuration.
 *
 * `init` must be called synchronously when the pixel script is evaluated, so the pixel is
 * registered in time.
 */
export function shopifyAppPixelPlugin(): RumPlugin {
  return {
    name: 'shopify-app-pixel',
    onInit({ initConfiguration, publicApi }) {
      const shopify = (globalObject as { shopify?: ShopifyGlobal }).shopify
      if (!shopify) {
        display.error('shopifyAppPixelPlugin must run in a Shopify Web Pixel extension')
        return false
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

          mockable(setShopifyBrowserApi)(api.browser)

          // In the worker, `location` is the pixel script URL: take the page URL from the event
          api.analytics.subscribe('page_viewed', (event) => {
            const url = event.context?.document?.location?.href
            if (url) {
              publicApi.startView({ url })
            }
          })

          resolve(undefined)
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
  initConfiguration.trackViewMetricsManually = true // The worker has no page to measure
  initConfiguration.sessionReplaySampleRate = 0 // Session Replay needs a DOM
  initConfiguration.profilingSampleRate = 0 // Profiling does not see the checkout main thread
  initConfiguration.trackSessionAcrossSubdomains = false // getCurrentSite() needs document.cookie, unavailable in the worker
}
