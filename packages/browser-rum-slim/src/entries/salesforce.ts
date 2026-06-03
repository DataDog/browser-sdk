import { defineGlobal, globalObject } from '@datadog/browser-core'
import type { RumPublicApi } from '@datadog/browser-rum-core'
import { makeRumPublicApi } from '@datadog/browser-rum-core'
import { makeRecorderApiStub } from '../boot/stubRecorderApi'
import { makeProfilerApiStub } from '../boot/stubProfilerApi'
import { makeSalesforceRumPublicApi } from '../domain/salesforce/salesforce'

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
  RumResourceEventDomainContext,
  RumLongTaskEventDomainContext,
} from '@datadog/browser-rum-core'
export { DEFAULT_TRACKED_RESOURCE_HEADERS } from '@datadog/browser-rum-core'
export { DefaultPrivacyLevel } from '@datadog/browser-core'
export type {
  SalesforceGenerateUrl,
  SalesforceRumInitConfiguration,
  SalesforceRumPublicApi,
  SalesforceViewOptions,
} from '../domain/salesforce/salesforce'

const rumPublicApi = makeRumPublicApi(makeRecorderApiStub(), makeProfilerApiStub(), {
  sdkName: 'rum-slim',
})

export const datadogRum = Object.assign(rumPublicApi, makeSalesforceRumPublicApi(rumPublicApi))

interface BrowserWindow {
  DD_RUM?: RumPublicApi & ReturnType<typeof makeSalesforceRumPublicApi>
}
defineGlobal(globalObject as BrowserWindow, 'DD_RUM', datadogRum)
