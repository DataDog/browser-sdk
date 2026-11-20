import { globalObject } from '@datadog/js-core/util'
import { defineGlobal } from '@datadog/browser-core'
import type { RumPublicApi } from '@datadog/browser-rum-core'
import { makeRumPublicApi } from '@datadog/browser-rum-core'
import { makeRecorderApi, makeProfilerApi } from '@datadog/browser-rum/internal'
import { shopifyPlugin } from '../domain/shopifyPlugin'
import { shopifyAppPixelPlugin } from '../domain/shopifyAppPixelPlugin'

type ShopifyRumPublicApi = RumPublicApi & {
  shopifyPlugin: typeof shopifyPlugin
  shopifyAppPixelPlugin: typeof shopifyAppPixelPlugin
}

interface BrowserWindow {
  DD_RUM?: ShopifyRumPublicApi
}

const global = globalObject as BrowserWindow

const datadogRum = makeRumPublicApi(makeRecorderApi(), makeProfilerApi(), {
  sdkName: 'rum-shopify',
}) as ShopifyRumPublicApi

datadogRum.shopifyPlugin = shopifyPlugin
datadogRum.shopifyAppPixelPlugin = shopifyAppPixelPlugin

defineGlobal(global, 'DD_RUM', datadogRum)
