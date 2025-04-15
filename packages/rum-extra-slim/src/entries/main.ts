import { defineGlobal, getGlobalObject, makePublicApi } from '@datadog/browser-core'
import { start } from '../boot/start'

export const datadogRum = makePublicApi(start())

interface BrowserWindow extends Window {
  DD_RUM_XS?: any
}

defineGlobal(getGlobalObject<BrowserWindow>(), 'DD_RUM_XS', datadogRum)
