import { defineGlobal, globalObject } from '@datadog/browser-core'
import type { RumPublicApi } from '@datadog/browser-rum-core'
import { makeRumPublicApi } from '@datadog/browser-rum-core'
import { makeRecorderApi, makeProfilerApi } from '@datadog/browser-rum/internal'
import { makeRecorderApiStub } from '../boot/stubRecorderApi'
import { makeProfilerApiStub } from '../boot/stubProfilerApi'
import { makeShopifyRumPublicApi } from '../boot/makeShopifyRumPublicApi'
import { patchSandboxedIframeApis } from '../boot/patchSandboxedIframeApis'
import { initShopifyBindings } from '../domain/shopifyBindings'
import { getShopifyAnalytics } from '../domain/shopifyAnalytics'

interface BrowserWindow {
  DD_RUM?: RumPublicApi
}

const global = globalObject as BrowserWindow
const shopifyAnalytics = getShopifyAnalytics()

if (shopifyAnalytics) {
  patchSandboxedIframeApis()

  let installed = false

  shopifyAnalytics.subscribe('page_viewed', (event) => {
    if (installed) {
      return
    }
    installed = true

    const url = event?.context?.document?.location?.href

    const datadogRum = makeShopifyRumPublicApi(
      makeRumPublicApi(makeRecorderApiStub(), makeProfilerApiStub(), {
        sdkName: 'rum-shopify-custom-pixel',
      }),
      url
    )

    initShopifyBindings(datadogRum, shopifyAnalytics)

    defineGlobal(global, 'DD_RUM', datadogRum)
  })
} else {
  const datadogRum = makeRumPublicApi(makeRecorderApi(), makeProfilerApi(), {
    sdkName: 'rum-shopify-storefront',
  })

  defineGlobal(global, 'DD_RUM', datadogRum)
}
