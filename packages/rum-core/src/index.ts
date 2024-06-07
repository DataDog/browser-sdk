export { RumPublicApi, makeRumPublicApi, RecorderApi, StartRecordingOptions } from './boot/rumPublicApi'
export { StartRum } from './boot/startRum'
export {
  RumEvent,
  RumActionEvent,
  CommonProperties,
  RumErrorEvent,
  RumViewEvent,
  RumResourceEvent,
  RumLongTaskEvent,
  RumVitalEvent,
} from './rumEvent.types'
export {
  RumLongTaskEventDomainContext,
  RumErrorEventDomainContext,
  RumOtherResourceEventDomainContext,
  RumXhrResourceEventDomainContext,
  RumFetchResourceEventDomainContext,
  RumActionEventDomainContext,
  RumViewEventDomainContext,
  RumEventDomainContext,
} from './domainContext.types'
export { ReplayStats, ActionType, RumEventType, FrustrationType, RawRumActionEvent } from './rawRumEvent.types'
export { startRum } from './boot/startRum'
export { LifeCycle, LifeCycleEventType } from './domain/lifeCycle'
export { ViewCreatedEvent } from './domain/view/trackViews'
export { ViewContexts, ViewContext, startViewContexts } from './domain/contexts/viewContexts'
export { RumSessionManager, RumSession } from './domain/rumSessionManager'
export { getMutationObserverConstructor } from './browser/domMutationObservable'
export { initViewportObservable, getViewportDimension, ViewportDimension } from './browser/viewportObservable'
export { getScrollX, getScrollY } from './browser/scroll'
export { RumInitConfiguration, RumConfiguration, RumRemoteConfiguration } from './domain/configuration'
export { DEFAULT_PROGRAMMATIC_ACTION_NAME_ATTRIBUTE } from './domain/action/getActionNameFromElement'
export { STABLE_ATTRIBUTES } from './domain/getSelectorFromElement'
export * from './browser/htmlDomUtils'
export * from './browser/polyfills'
export { getSessionReplayUrl } from './domain/getSessionReplayUrl'
export { isLongDataUrl, sanitizeDataUrl, MAX_ATTRIBUTE_VALUE_CHAR_LENGTH } from './domain/resource/resourceUtils'
export * from './domain/privacy'
export { SessionReplayState } from './domain/rumSessionManager'
export type { RumPlugin } from './domain/plugins'
