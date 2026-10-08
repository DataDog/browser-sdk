/**
 * Datadog Browser RUM SDK - Full version with Session Replay and Real User Profiling capabilities.
 * Use this package to monitor your web application's performance and user experience.
 *
 * @packageDocumentation
 * @see [RUM Browser Monitoring Setup](https://docs.datadoghq.com/real_user_monitoring/browser/)
 */

import { globalObject } from '@datadog/js-core/util'
// Keep the following in sync with packages/browser-rum-slim/src/entries/main.ts
import { defineGlobal } from '@datadog/browser-core'
import type { RumPublicApi } from '@datadog/browser-rum-core'
import { makeRumPublicApi } from '@datadog/browser-rum-core'
import { makeRecorderApi } from '../boot/recorderApi'
import { createDeflateEncoder, startDeflateWorker } from '../domain/deflate'
import { makeProfilerApi } from '../boot/profilerApi'
import { startEarlyProfiler } from '../domain/profiling/earlyProfilerEagerStart'

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

  // Events
  CommonProperties,
  RumEvent,
  RumActionEvent,
  RumErrorEvent,
  RumLongTaskEvent,
  RumResourceEvent,
  RumViewEvent,
  RumViewUpdateEvent,
  RumVitalEvent,

  // Events context
  RumEventDomainContext,
  RumViewEventDomainContext,
  RumErrorEventDomainContext,
  RumActionEventDomainContext,
  RumVitalEventDomainContext,
  RumResourceEventDomainContext,
  RumWebSocketResourceEventDomainContext,
  RumLongTaskEventDomainContext,
} from '@datadog/browser-rum-core'

export { DEFAULT_TRACKED_RESOURCE_HEADERS, CanvasRecordingQuality } from '@datadog/browser-rum-core'

const recorderApi = makeRecorderApi()

const profilerApi = makeProfilerApi()

/**
 * PROF-16083 prod-test build — "SDK Early Collection at eval" (S3 variant):
 * the early data collection moment (SDK bundle evaluation, like
 * `startBufferingData()` for resources and errors) is extended to also start
 * the Profiler. In this build it starts unconditionally — the build itself is
 * the experiment — while the peek guard above keeps any snippet-started
 * instance (which covers a longer window) untouched.
 *
 * The running instance is exposed through the same `window` global as the
 * early profiler snippet, so the profiler chunk adopts it as its first
 * periodic instance when it loads. The SDK stops the instance and discards
 * its samples at init when profiling won't happen (no session, not sampled,
 * unsupported browser), or when the profiler chunk fails to load.
 */
startEarlyProfiler()

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

interface BrowserWindow {
  DD_RUM?: RumPublicApi
}
defineGlobal(globalObject as BrowserWindow, 'DD_RUM', datadogRum)
