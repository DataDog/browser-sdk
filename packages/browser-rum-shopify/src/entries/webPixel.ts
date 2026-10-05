import { globalObject } from '@datadog/js-core/util'
import { defineGlobal } from '@datadog/browser-core'
import { startWebPixelRum } from '../boot/startWebPixelRum'

interface WebPixelGlobal {
  DD_RUM_WEB_PIXEL?: { init: typeof startWebPixelRum }
}

// Loaded in the Web Pixel worker with `importScripts()`
defineGlobal(globalObject as WebPixelGlobal, 'DD_RUM_WEB_PIXEL', { init: startWebPixelRum })
