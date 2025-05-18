import { defineGlobal, getGlobalObject } from '@datadog/browser-core'

const datadogFlagging = {}

interface BrowserWindow extends Window {
  DD_FLAGGING?: {}
}
defineGlobal(getGlobalObject<BrowserWindow>(), 'DD_FLAGGING', datadogFlagging)
