export type { RumPublicApi, RecorderApi, ProfilerApi, StartRecordingOptions, Strategy } from './boot/rumPublicApi'
export { makeRumPublicApi } from './boot/rumPublicApi'
export type { StartRum, StartRumResult } from './boot/startRum'
export type {
  RumEvent,
  RumActionEvent,
  CommonProperties,
  RumErrorEvent,
  RumViewEvent,
  RumResourceEvent,
  RumLongTaskEvent,
  RumVitalEvent,
  ProfilingInternalContextSchema,
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
  RumVitalEventDomainContext,
} from './domainContext.types'
export type { ReplayStats, RawRumActionEvent, RawRumEvent } from './rawRumEvent.types'
export { ActionType, RumEventType, FrustrationType } from './rawRumEvent.types'
export { startRum } from './boot/startRum'
export type { RawRumEventCollectedData } from './domain/lifeCycle'
export { LifeCycle, LifeCycleEventType } from './domain/lifeCycle'
export type { ViewCreatedEvent, ViewOptions } from './domain/view/trackViews'
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
export type {
  RumInitConfiguration,
  RumConfiguration,
  FeatureFlagsForEvents,
  RemoteConfiguration,
} from './domain/configuration'
export { DEFAULT_PROGRAMMATIC_ACTION_NAME_ATTRIBUTE } from './domain/action/actionNameConstants'
export { STABLE_ATTRIBUTES } from './domain/getSelectorFromElement'
export * from './browser/htmlDomUtils'
export { getSessionReplayUrl } from './domain/getSessionReplayUrl'
export { sanitizeIfLongDataUrl } from './domain/resource/resourceUtils'
export * from './domain/privacy'
export * from './domain/privacyConstants'
export { SessionReplayState } from './domain/rumSessionManager'
export type { RumPlugin, OnRumStartOptions } from './domain/plugins'
export type { MouseEventOnElement } from './domain/action/listenActionEvents'
export { supportPerformanceTimingEvent } from './browser/performanceObservable'
export { RumPerformanceEntryType } from './browser/performanceObservable'
export type { AllowedRawRumEvent } from './domain/event/eventCollection'
export type {
  DurationVitalReference,
  DurationVitalStart,
  AddDurationVitalOptions,
  DurationVitalOptions,
} from './domain/vital/vitalCollection'
export type { Hooks, DefaultRumEventAttributes, DefaultTelemetryEventAttributes } from './domain/hooks'
export { createHooks } from './domain/hooks'
export { isSampled } from './domain/sampler/sampler'
export type { TracingOption, PropagatorType } from './domain/tracing/tracer.types'
export type { TransportPayload } from './transport/formDataTransport'
export { createFormDataTransport } from './transport/formDataTransport'
