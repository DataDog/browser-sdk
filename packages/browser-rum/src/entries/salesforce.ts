import { globalObject } from '@datadog/js-core/util'
import { defineGlobal } from '@datadog/browser-core'
import type { RumPublicApi } from '@datadog/browser-rum-core'
import { makeRumPublicApi } from '@datadog/browser-rum-core'
import { makeRecorderApi } from '../boot/recorderApi'
import { makeProfilerApi } from '../boot/profilerApi'
import { createDeflateEncoder, startDeflateWorker } from '../domain/deflate'

export type {
  User,
  Account,
  TraceContextInjection,
  SessionPersistence,
  TrackingConsent,
  MatchOption,
  Context,
  ContextValue,
  ContextArray,
  RumInternalContext,
} from '@datadog/browser-core'
export { DefaultPrivacyLevel } from '@datadog/browser-core'
export type { ProxyFn, Site } from '@datadog/js-core/transport'

/** @deprecated Use {@link DatadogRum} instead */
export type RumGlobal = RumPublicApi

export type {
  RumPublicApi as DatadogRum,
  RumInitConfiguration,
  RumBeforeSend,
  ViewOptions,
  StartRecordingOptions,
  AddDurationVitalOptions,
  DurationVitalOptions,
  OperationOptions,
  FeatureOperationOptions,
  FailureReason,
  ActionOptions,
  ResourceOptions,
  ResourceStopOptions,
  TracingOption,
  RumPlugin,
  OnRumStartOptions,
  RumPluginOnInitOptions,
  PropagatorType,
  FeatureFlagsForEvents,
  MatchHeader,
  CommonProperties,
  RumEvent,
  RumActionEvent,
  RumErrorEvent,
  RumLongTaskEvent,
  RumResourceEvent,
  RumViewEvent,
  RumViewUpdateEvent,
  RumVitalEvent,
  RumEventDomainContext,
  RumViewEventDomainContext,
  RumErrorEventDomainContext,
  RumActionEventDomainContext,
  RumVitalEventDomainContext,
  RumResourceEventDomainContext,
  RumWebSocketResourceEventDomainContext,
} from '@datadog/browser-rum-core'
export { DEFAULT_TRACKED_RESOURCE_HEADERS } from '@datadog/browser-rum-core'

/** The global RUM instance for Salesforce Experience Cloud Head Markup. */
const recorderApi = makeRecorderApi()

const profilerApi = makeProfilerApi()

export const datadogRum = makeRumPublicApi(recorderApi, profilerApi, {
  startDeflateWorker,
  createDeflateEncoder,
  sdkName: 'rum-salesforce',
})

interface BrowserWindow {
  DD_RUM?: RumPublicApi
}
defineGlobal(globalObject as BrowserWindow, 'DD_RUM', datadogRum)
