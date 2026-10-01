import { globalObject } from '@datadog/js-core/util'
import { defineGlobal } from '@datadog/browser-core'
import type { RumPublicApi } from '@datadog/browser-rum-core'
import { makeRumPublicApi } from '@datadog/browser-rum-core'
import { makeRecorderApi, makeProfilerApi } from '@datadog/browser-rum/internal'

interface BrowserWindow {
  DD_RUM?: RumPublicApi
}

const datadogRum = makeRumPublicApi(makeRecorderApi(), makeProfilerApi(), {
  sdkName: 'rum-shopify',
})

defineGlobal(globalObject as BrowserWindow, 'DD_RUM', datadogRum)
