export type { RumPublicApi, RecorderApi, ProfilerApi, StartRecordingOptions } from './boot/rumPublicApi'
export { makeRumPublicApi } from './boot/rumPublicApi'
export { validateAndBuildRumConfiguration } from './domain/configuration'
export { startInternalApiBatch } from './transport/startInternalApiBatch'
export { formatErrorEvent } from './domain/internalApi/errorFormatter'
export { createRumInternalApi } from './domain/internalApi/rumInternalApi'
export type { BeforeSend } from './domain/internalApi/rumInternalApi'
export type { RumEventHistoryEntry, EventCounts } from './domain/internalApi/rumInternalApi.types'
export type {
  RumInternalApi,
  ViewEventHandle,
  NonViewEventHandle,
  EventBaggage,
  BaseRumEvent,
  AddEventOptions,
  ConfigureOptions,
} from './domain/internalApi/rumInternalApi.types'
export type { StartRum, StartRumResult } from './boot/startRum'
export type {
  RumEvent,
  RumActionEvent,
  CommonProperties,
  RumErrorEvent,
  RumViewEvent,
  RumViewUpdateEvent,
  RumResourceEvent,
  RumLongTaskEvent,
  RumVitalEvent,
  ProfilingInternalContextSchema,
} from './rumEvent.types'
export type {
  RumLongTaskEventDomainContext,
  RumErrorEventDomainContext,
  RumManualResourceEventDomainContext,
  RumResourceEventDomainContext,
  RumWebSocketResourceEventDomainContext,
  RumActionEventDomainContext,
  RumViewEventDomainContext,
  RumEventDomainContext,
  RumVitalEventDomainContext,
} from './domainContext.types'
export type { ReplayStats, RawRumActionEvent, RawRumEvent } from './rawRumEvent.types'
export { ActionType, RumEventType, FrustrationType, RumLongTaskEntryType, VitalType } from './rawRumEvent.types'
export { startRum } from './boot/startRum'
export type { RawRumEventCollectedData } from './domain/lifeCycle'
export { LifeCycle, LifeCycleEventType } from './domain/lifeCycle'
export type { ViewOptions } from './domain/view/trackViews'
export type { ViewCreatedEvent, ViewEndedEvent } from './domain/contexts/viewHistory'
export type { ViewHistoryEntry, ViewHistory } from './domain/contexts/viewHistory'
export { startViewHistory } from './domain/contexts/viewHistory'
export type { SessionManager } from '@datadog/browser-core'
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
  RumBeforeSend,
  FeatureFlagsForEvents,
  RemoteConfiguration,
  MatchHeader,
} from './domain/configuration'
export { DEFAULT_TRACKED_RESOURCE_HEADERS } from './domain/configuration'
export { DEFAULT_PROGRAMMATIC_ACTION_NAME_ATTRIBUTE } from './domain/action/actionNameConstants'
export { STABLE_ATTRIBUTES } from './domain/getSelectorFromElement'
export * from './browser/htmlDomUtils'
export { getSessionReplayUrl } from './domain/getSessionReplayUrl'
export { sanitizeIfLongDataUrl } from './domain/resource/resourceUtils'
export * from './domain/privacy'
export * from './domain/privacyConstants'
export { SessionReplayState, computeSessionReplayState } from './domain/sessionReplayState'
export type { RumPlugin } from './domain/plugins'
export type { MouseEventOnElement } from './domain/action/listenActionEvents'
export { supportPerformanceTimingEvent } from './browser/performanceObservable'
export { RumPerformanceEntryType } from './browser/performanceObservable'
export type { AllowedRawRumEvent } from './domain/event/eventCollection'
export type {
  DurationVitalStart,
  AddDurationVitalOptions,
  DurationVitalOptions,
  OperationOptions,
  FeatureOperationOptions,
  FailureReason,
} from './domain/vital/vitalCollection'
export type { ActionOptions } from './domain/action/trackClickActions'
export type { ResourceOptions, ResourceStopOptions } from './domain/resource/trackManualResources'
export type { Hooks, DefaultRumEventAttributes, DefaultTelemetryEventAttributes } from './domain/hooks'
export { createHooks } from './domain/hooks'
export type { TracingOption, PropagatorType } from './domain/tracing/tracer.types'
export type { TransportPayload } from './transport/formDataTransport'
export { createFormDataTransport } from './transport/formDataTransport'
