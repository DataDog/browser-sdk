// PoC (bonus phase of the internal API plan, see /plan.md): the Shopify SDK is a standalone,
// minimal SDK built on the RUM internal API — the full RUM public API (auto-instrumentation,
// recorder, profiler, telemetry, contexts) is not part of its bundle anymore. The glue mirrors
// what the phase 2 public API does in doInit: validate the configuration, start the session
// manager, create the internal API, start the transport batch, then let the Shopify Web Pixel
// bindings build RUM data (views, click actions, checkout UI extension errors) from Shopify
// messages.
//
// Corner-cuts, documented in /plan.md:
// * The storefront path (init() without `shopifyAnalytics`, served by the Theme Liquid snippet)
//   is removed: init() only runs in the Custom Pixel sandbox.
// * Tracking consent is assumed granted (same corner-cut as the phase 2 public API).
// * No intake request compression (identity encoder, no deflate worker).
// * Inputs are not sanitized (the values come from Shopify events, not arbitrary customer
//   objects — the phase 2 public API sanitizes its own public surface instead).

import {
  catchUserErrors,
  createIdentityEncoder,
  createTrackingConsentState,
  display,
  displayAlreadyInitializedError,
  mockable,
  startSessionManager,
} from '@datadog/browser-core'
import type { SessionManager } from '@datadog/browser-core'
import {
  createRumInternalApi,
  startInternalApiBatch,
  validateAndBuildRumConfiguration,
} from '@datadog/browser-rum-core'
import type { BeforeSend, RumInitConfiguration } from '@datadog/browser-rum-core'
import type { ShopifyAnalyticsApi } from '../domain/shopifyAnalytics'
import { initShopifyBindings } from '../domain/shopifyBindings'
import { patchSandboxedIframeApis } from './patchSandboxedIframeApis'

export interface ShopifyInitConfiguration extends RumInitConfiguration {
  /**
   * The Custom Pixel sandbox's `analytics` global. Required: this SDK only runs inside the
   * sandbox, where RUM data is built from Shopify Web Pixel events.
   */
  shopifyAnalytics?: ShopifyAnalyticsApi
}

/**
 * Public API of the Shopify RUM SDK (PoC): a single `init()` that starts the minimal SDK. The
 * full `RumPublicApi` surface is gone — there is nothing to drive manually, Shopify messages
 * are the only data source.
 */
export interface ShopifyRumApi {
  init: (initConfiguration: ShopifyInitConfiguration) => void
}

export function makeShopifyRumApi(): ShopifyRumApi {
  let started = false

  return {
    init(initConfiguration: ShopifyInitConfiguration) {
      if (!initConfiguration) {
        display.error('Missing configuration')
        return
      }

      const { shopifyAnalytics: analytics, ...initOptions } = initConfiguration

      if (!analytics) {
        display.warn(
          'The Shopify RUM SDK only runs with a `shopifyAnalytics` configuration (Custom Pixel sandbox). ' +
            'Nothing will be collected.'
        )
        return
      }

      if (started) {
        displayAlreadyInitializedError('DD_RUM', initConfiguration)
        return
      }
      started = true

      // The pixel sandbox iframe breaks several browser APIs the session manager relies on;
      // patch them before starting anything (unchanged from the replaced implementation).
      mockable(patchSandboxedIframeApis)()

      const configuration = validateAndBuildRumConfiguration({
        ...initOptions,
        // The sandboxed iframe shares the parent page's cookie jar (same domain) — cookie is the
        // only session persistence that works there, and it lets the pixel session join the
        // storefront session (forced by the replaced implementation too).
        sessionPersistence: 'cookie',
      })
      if (!configuration) {
        return
      }

      const trackingConsentState = createTrackingConsentState()
      trackingConsentState.tryToInit(configuration.trackingConsent)
      // PoC corner-cut: tracking consent is assumed granted (see /plan.md).
      trackingConsentState.update('granted')

      const sessionManagerPromise: Promise<SessionManager | undefined> = mockable(startSessionManager)(
        configuration,
        trackingConsentState
      )

      // PoC v2: the internal API is created eagerly (unconfigured) and bindings are wired right
      // away — events collected before configure (or before the session manager resolves) are
      // held by the API and assembled once it is ready.
      const internalApi = createRumInternalApi()

      // Bind the configuration first: the internal API subscribes the session manager
      // observables (ending the current view on expiry) before the batch subscribes its expiry
      // flush on the same promise — the final view version is upserted before the flush,
      // structurally.
      internalApi.configure({
        sessionManager: sessionManagerPromise,
        beforeSend: initOptions.beforeSend
          ? (catchUserErrors(initOptions.beforeSend, 'beforeSend threw an error:') as unknown as BeforeSend)
          : undefined,
      })

      mockable(startInternalApiBatch)(configuration, internalApi, sessionManagerPromise, createIdentityEncoder)

      initShopifyBindings(internalApi, analytics)
    },
  }
}
