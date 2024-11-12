// Keep the following in sync with packages/rum-slim/src/entries/main.ts
import { defineGlobal, getGlobalObject } from '@datadog/browser-core'
import type { RumPublicApi } from '@datadog/browser-rum-core'
import { makeRumPublicApi, startRum } from '@datadog/browser-rum-core'

import { startRecording } from '../boot/startRecording'
import { makeRecorderApi } from '../boot/recorderApi'
import { createDeflateEncoder, startDeflateWorker } from '../domain/deflate'

export {
  CommonProperties,
  RumPublicApi as RumGlobal,
  RumInitConfiguration,
  // Events
  RumEvent,
  RumActionEvent,
  RumErrorEvent,
  RumLongTaskEvent,
  RumResourceEvent,
  RumViewEvent,
  RumVitalEvent,
  // Events context
  RumEventDomainContext,
  RumViewEventDomainContext,
  RumErrorEventDomainContext,
  RumActionEventDomainContext,
  RumFetchResourceEventDomainContext,
  RumXhrResourceEventDomainContext,
  RumOtherResourceEventDomainContext,
  RumLongTaskEventDomainContext,
} from '@datadog/browser-rum-core'
export { DefaultPrivacyLevel } from '@datadog/browser-core'

const recorderApi = makeRecorderApi(startRecording)
export const datadogRum = makeRumPublicApi(startRum, recorderApi, { startDeflateWorker, createDeflateEncoder })
// function intiActionNameAllowlist() {
//   if (!getGlobalObject<BrowserWindow>()) {
//     return
//   }
//   // check if it is staging
//   if (
//     !getGlobalObject<BrowserWindow>().location ||
//     !getGlobalObject<BrowserWindow>().location.hostname.includes('datad0g')
//   ) {
//     return
//   }
//   if (!getGlobalObject<BrowserWindow>().DD_ALLOWLIST_DICTIONARY) {
//     fetch('/static/v/dist.allowed-strings.json')
//       .then((response) => {
//         response
//           .json()
//           .then((data) => defineGlobal(getGlobalObject<BrowserWindow>(), 'DD_ALLOWLIST_DICTIONARY', data))
//           .catch((error) => {
//             addTelemetryDebug('Failed to parse allowed strings', error)
//           })
//       })
//       .catch((error) => {
//         addTelemetryDebug('Failed to download allowed strings', error)
//       })
//   }
// }
interface BrowserWindow extends Window {
  DD_RUM?: RumPublicApi
  DD_ALLOWLIST_DICTIONARY?: { [key: string]: boolean }
}
defineGlobal(getGlobalObject<BrowserWindow>(), 'DD_RUM', datadogRum)
// intiActionNameAllowlist()
