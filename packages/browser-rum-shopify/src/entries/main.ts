import { defineGlobal, globalObject } from '@datadog/browser-core'
import type { RumPublicApi } from '@datadog/browser-rum-core'
import { makeRumPublicApi } from '@datadog/browser-rum-core'
import { makeRecorderApi, makeProfilerApi } from '@datadog/browser-rum/internal'
import { makeShopifyRumPublicApi } from '../boot/makeShopifyRumPublicApi'

interface BrowserWindow {
  DD_RUM?: RumPublicApi
}

const global = globalObject as BrowserWindow

const datadogRum = makeShopifyRumPublicApi(
  makeRumPublicApi(makeRecorderApi(), makeProfilerApi(), {
    sdkName: 'rum-shopify',
  })
)

defineGlobal(global, 'DD_RUM', datadogRum)
