import { defineGlobal, getGlobalObject, noop } from '@datadog/browser-core'
import { makeRumPublicApi, RumPublicApi, startRum } from '@datadog/browser-rum-core'

export const datadogRum = makeRumPublicApi(startRum, {
  start: noop,
  stop: noop,
  onRumStart: noop,
  isRecording: () => false,
  getViewStats: () => undefined,
})

interface BrowserWindow extends Window {
  DD_RUM?: RumPublicApi
}
defineGlobal(getGlobalObject<BrowserWindow>(), 'DD_RUM', datadogRum)
