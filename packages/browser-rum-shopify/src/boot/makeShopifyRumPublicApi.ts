import type { RumInitConfiguration, RumPublicApi } from '@datadog/browser-rum-core'

/**
 * In the Custom Pixel sandbox, wraps `RumPublicApi.init()` with default configuration suited to
 * that iframe (see below). Outside the sandbox (storefront context), returns `datadogRum` as-is.
 */
export function makeShopifyRumPublicApi(datadogRum: RumPublicApi, isCustomPixelSandbox: boolean): RumPublicApi {
  if (!isCustomPixelSandbox) {
    return datadogRum
  }

  return {
    ...datadogRum,
    init(initConfiguration: RumInitConfiguration) {
      datadogRum.init({
        ...initConfiguration,
        trackViewsManually: true, // Views are started explicitly via startView()
        sessionReplaySampleRate: 0, // Session Replay is not usable in the Pixel sandbox iframe
        trackUserInteractions: false, // Pixel sandbox iframe has no real DOM to interact with
        trackResources: false, // Iframe resources are not meaningful
        trackLongTasks: false, // PerformanceObserver tracks the empty iframe
        sessionPersistence: 'cookie',
      })
    },
  }
}
