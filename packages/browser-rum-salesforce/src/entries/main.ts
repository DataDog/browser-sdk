// Keep the following in sync with packages/browser-rum-slim/src/entries/main.ts
import { defineGlobal, globalObject } from '@datadog/browser-core'
import type { RumPublicApi } from '@datadog/browser-rum-core'
import { makeRumPublicApi } from '@datadog/browser-rum-core'
import { makeRecorderApiStub, makeProfilerApiStub } from '@datadog/browser-rum-slim'

export type {
  User,
  Account,
  TraceContextInjection,
  SessionPersistence,
  TrackingConsent,
  MatchOption,
  ProxyFn,
  Site,
  Context,
  ContextValue,
  ContextArray,
  RumInternalContext,
} from '@datadog/browser-core'

/**
 * @deprecated Use {@link DatadogRum} instead
 */
export type RumGlobal = RumPublicApi

export type {
  RumPublicApi as DatadogRum,
  RumInitConfiguration,
  RumBeforeSend,
  ViewOptions,
  StartRecordingOptions,
  AddDurationVitalOptions,
  DurationVitalOptions,
  FeatureOperationOptions,
  FailureReason,
  ActionOptions,
  ResourceOptions,
  ResourceStopOptions,
  TracingOption,
  RumPlugin,
  OnRumStartOptions,
  PropagatorType,
  FeatureFlagsForEvents,
  MatchHeader,

  // Events
  CommonProperties,
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
  RumVitalEventDomainContext,
  RumResourceEventDomainContext,
  RumLongTaskEventDomainContext,
} from '@datadog/browser-rum-core'
export { DEFAULT_TRACKED_RESOURCE_HEADERS } from '@datadog/browser-rum-core'
export { DefaultPrivacyLevel } from '@datadog/browser-core'

/**
 * The global RUM instance. Use this to call RUM methods.
 *
 * @category Main
 * @see {@link DatadogRum}
 * @see [RUM Browser Monitoring Setup](https://docs.datadoghq.com/real_user_monitoring/browser/)
 */
export const datadogRum = makeRumPublicApi(makeRecorderApiStub(), makeProfilerApiStub(), {
  sdkName: 'rum-salesforce',
})

interface BrowserWindow {
  DD_RUM?: RumPublicApi
}
defineGlobal(globalObject as BrowserWindow, 'DD_RUM', datadogRum)
