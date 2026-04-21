/**
 * Datadog Browser RUM SDK - Full version with Session Replay and Real User Profiling capabilities.
 * Use this package to monitor your web application's performance and user experience.
 *
 * @packageDocumentation
 * @see [RUM Browser Monitoring Setup](https://docs.datadoghq.com/real_user_monitoring/browser/)
 */

// Keep the following in sync with packages/rum-slim/src/entries/main.ts
import { defineGlobal, getGlobalObject } from '@datadog/browser-core'
import type { RumPublicApi } from '@datadog/browser-rum-core'
import { makeRumPublicApi } from '@datadog/browser-rum-core'
import { makeRecorderApi } from '../boot/recorderApi'
import { createDeflateEncoder, startDeflateWorker } from '../domain/deflate'
import { makeProfilerApi } from '../boot/profilerApi'

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
export { DefaultPrivacyLevel } from '@datadog/browser-core'

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

const recorderApi = makeRecorderApi()

const profilerApi = makeProfilerApi()

/**
 * The global RUM instance. Use this to call RUM methods.
 *
 * @category Main
 * @see {@link DatadogRum}
 * @see [RUM Browser Monitoring Setup](https://docs.datadoghq.com/real_user_monitoring/browser/)
 */
export const datadogRum = makeRumPublicApi(recorderApi, profilerApi, {
  startDeflateWorker,
  createDeflateEncoder,
  sdkName: 'rum',
})

interface BrowserWindow extends Window {
  DD_RUM?: RumPublicApi
}
defineGlobal(getGlobalObject<BrowserWindow>(), 'DD_RUM', datadogRum)
