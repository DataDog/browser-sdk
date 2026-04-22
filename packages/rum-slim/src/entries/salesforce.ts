import { defineGlobal, getGlobalObject } from '@datadog/browser-core'
import type { RumPublicApi, RumInitConfiguration } from '@datadog/browser-rum-core'
import { makeRumPublicApi } from '@datadog/browser-rum-core'
import { makeRecorderApiStub } from '../boot/stubRecorderApi'
import { makeProfilerApiStub } from '../boot/stubProfilerApi'
import { buildSalesforceInitConfiguration } from '../boot/salesforceInitConfiguration'

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

export type {
  RumPublicApi as DatadogRum,
  RumInitConfiguration,
  RumBeforeSend,
  ViewOptions,
  StartRecordingOptions,
  AddDurationVitalOptions,
  DurationVitalOptions,
  DurationVitalReference,
  TracingOption,
  RumPlugin,
  OnRumStartOptions,
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
  RumVitalEvent,
  RumEventDomainContext,
  RumViewEventDomainContext,
  RumErrorEventDomainContext,
  RumActionEventDomainContext,
  RumVitalEventDomainContext,
  RumFetchResourceEventDomainContext,
  RumXhrResourceEventDomainContext,
  RumOtherResourceEventDomainContext,
  RumLongTaskEventDomainContext,
} from '@datadog/browser-rum-core'
export { DEFAULT_TRACKED_RESOURCE_HEADERS } from '@datadog/browser-rum-core'
export { DefaultPrivacyLevel } from '@datadog/browser-core'

// eslint-disable-next-line local-rules/disallow-side-effects
const baseRum = makeRumPublicApi(makeRecorderApiStub(), makeProfilerApiStub(), {
  sdkName: 'rum-slim',
  runtimeCapabilities: {
    requestCollection: false,
    runtimeErrors: false,
    viewMetrics: false,
  },
})

export const datadogRum: RumPublicApi = {
  ...baseRum,
  init(initConfiguration: RumInitConfiguration) {
    baseRum.init(buildSalesforceInitConfiguration(initConfiguration))
  },
}

interface BrowserWindow extends Window {
  DD_RUM?: RumPublicApi
}

// eslint-disable-next-line local-rules/disallow-side-effects
defineGlobal(getGlobalObject<BrowserWindow>(), 'DD_RUM', datadogRum)
