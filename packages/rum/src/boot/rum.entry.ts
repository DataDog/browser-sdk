import { defineGlobal, getGlobalObject } from '@datadog/browser-core'
import { makeRumPublicApi, RumPublicApi, startRum } from '@datadog/browser-rum-core'

export const datadogRum = makeRumPublicApi(startRum)

interface BrowserWindow extends Window {
  DD_RUM?: RumPublicApi
}
defineGlobal(getGlobalObject<BrowserWindow>(), 'DD_RUM', datadogRum)
