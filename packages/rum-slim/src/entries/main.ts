// Keep the following in sync with packages/rum/src/entries/main.ts
import { defineGlobal, getGlobalObject, noop } from '@datadog/browser-core'
import { makeRumPublicApi, RumPublicApi, startRum } from '@datadog/browser-rum-core'

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

export const datadogRum = makeRumPublicApi(startRum, {
  start: noop,
  stop: noop,
  onRumStart: noop,
  isRecording: () => false,
  getReplayStats: () => undefined,
})

interface BrowserWindow extends Window {
  DD_RUM?: RumPublicApi
}
defineGlobal(getGlobalObject<BrowserWindow>(), 'DD_RUM', datadogRum)
