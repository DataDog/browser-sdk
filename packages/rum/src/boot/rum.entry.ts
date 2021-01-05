import { defineGlobal, getGlobalObject } from '@datadog/browser-core'
import { makeRumGlobal, RumGlobal, startRum } from '@datadog/browser-rum-core'

export const datadogRum = makeRumGlobal(startRum)

interface BrowserWindow extends Window {
  DD_RUM?: RumGlobal
}
defineGlobal(getGlobalObject<BrowserWindow>(), 'DD_RUM', datadogRum)
