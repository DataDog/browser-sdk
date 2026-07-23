import { defineGlobal, globalObject } from '@datadog/browser-core'
import type { RumPublicApi } from '@datadog/browser-rum-core'
import { makeRumPublicApi } from '@datadog/browser-rum-core'
import { makeRecorderApi, makeProfilerApi } from '@datadog/browser-rum/internal'
import { makeShopifyRumPublicApi } from '../boot/makeShopifyRumPublicApi'
import { patchSandboxedIframeApis } from '../boot/patchSandboxedIframeApis'
import { initShopifyBindings } from '../domain/shopifyBindings'
import { getShopifyAnalytics } from '../domain/shopifyAnalytics'

interface BrowserWindow {
  DD_RUM?: RumPublicApi
}

const global = globalObject as BrowserWindow
const shopifyAnalytics = getShopifyAnalytics()
const isCustomPixelSandbox = !!shopifyAnalytics

const datadogRum = makeShopifyRumPublicApi(
  makeRumPublicApi(makeRecorderApi(), makeProfilerApi(), {
    sdkName: 'rum-shopify',
  }),
  isCustomPixelSandbox
)

if (isCustomPixelSandbox) {
  patchSandboxedIframeApis()
  initShopifyBindings(datadogRum, shopifyAnalytics)
}

defineGlobal(global, 'DD_RUM', datadogRum)
