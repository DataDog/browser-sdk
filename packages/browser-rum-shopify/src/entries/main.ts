import { defineGlobal, globalObject } from '@datadog/browser-core'
import type { RumPublicApi } from '@datadog/browser-rum-core'
import { makeRumPublicApi } from '@datadog/browser-rum-core'
import { makeRecorderApi, makeProfilerApi } from '@datadog/browser-rum/internal'
import { shopifyPlugin } from '../domain/shopifyPlugin'

type ShopifyRumPublicApi = RumPublicApi & { shopifyPlugin: typeof shopifyPlugin }

interface BrowserWindow {
  DD_RUM?: ShopifyRumPublicApi
}

const global = globalObject as BrowserWindow

const datadogRum = makeRumPublicApi(makeRecorderApi(), makeProfilerApi(), {
  sdkName: 'rum-shopify',
  embeddedPlugins: { shopifyPlugin },
}) as ShopifyRumPublicApi

defineGlobal(global, 'DD_RUM', datadogRum)
