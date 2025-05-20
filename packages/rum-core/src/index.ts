export type { RumPublicApi, RecorderApi, ProfilerApi, StartRecordingOptions, Strategy } from './boot/rumPublicApi'
export { makeRumPublicApi } from './boot/rumPublicApi'
export type { StartRum } from './boot/startRum'
export type {
  RumEvent,
  RumActionEvent,
  CommonProperties,
  RumErrorEvent,
  RumViewEvent,
  RumResourceEvent,
  RumLongTaskEvent,
  RumVitalEvent,
} from './rumEvent.types'
export type {
  RumLongTaskEventDomainContext,
  RumErrorEventDomainContext,
  RumOtherResourceEventDomainContext,
  RumXhrResourceEventDomainContext,
  RumFetchResourceEventDomainContext,
  RumActionEventDomainContext,
  RumViewEventDomainContext,
  RumEventDomainContext,
} from './domainContext.types'
export type { ReplayStats, RawRumActionEvent, RawRumEvent } from './rawRumEvent.types'
export { ActionType, RumEventType, FrustrationType } from './rawRumEvent.types'
export { startRum } from './boot/startRum'
export type { RawRumEventCollectedData } from './domain/lifeCycle'
export { LifeCycle, LifeCycleEventType } from './domain/lifeCycle'
export type { ViewCreatedEvent } from './domain/view/trackViews'
export type { ViewHistoryEntry, ViewHistory } from './domain/contexts/viewHistory'
export { startViewHistory } from './domain/contexts/viewHistory'
export type { RumSessionManager, RumSession } from './domain/rumSessionManager'
export { getMutationObserverConstructor } from './browser/domMutationObservable'
export type {
  RumMutationRecord,
  RumAttributesMutationRecord,
  RumChildListMutationRecord,
  RumCharacterDataMutationRecord,
} from './browser/domMutationObservable'
export type { ViewportDimension } from './browser/viewportObservable'
export { initViewportObservable, getViewportDimension } from './browser/viewportObservable'
export { getScrollX, getScrollY } from './browser/scroll'
export type { RumInitConfiguration, RumConfiguration } from './domain/configuration'
export { DEFAULT_PROGRAMMATIC_ACTION_NAME_ATTRIBUTE } from './domain/action/getActionNameFromElement'
export { STABLE_ATTRIBUTES } from './domain/getSelectorFromElement'
export * from './browser/htmlDomUtils'
export { getSessionReplayUrl } from './domain/getSessionReplayUrl'
export { isLongDataUrl, sanitizeDataUrl } from './domain/resource/resourceUtils'
export * from './domain/privacy'
export { SessionReplayState } from './domain/rumSessionManager'
export type { RumPlugin } from './domain/plugins'
export type { MouseEventOnElement } from './domain/action/listenActionEvents'
export { supportPerformanceTimingEvent } from './browser/performanceObservable'
export { RumPerformanceEntryType } from './browser/performanceObservable'
