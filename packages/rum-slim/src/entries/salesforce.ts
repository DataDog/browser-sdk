import { defineGlobal, getGlobalObject } from '@datadog/browser-core'
import type { RumPublicApi } from '@datadog/browser-rum-core'
import { makeRumPublicApi } from '@datadog/browser-rum-core'
import { makeProfilerApiStub } from '../boot/stubProfilerApi'
import { makeRecorderApiStub } from '../boot/stubRecorderApi'
import { createSalesforceViewsPlugin } from '../domain/salesforce/salesforceViewsPlugin'
import type { SalesforceViewsPlugin } from '../domain/salesforce/salesforceViewsPlugin'

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
export type RumGlobal = DatadogRum

export interface DatadogRum extends RumPublicApi {
  createSalesforceViewsPlugin: () => SalesforceViewsPlugin
}

export type {
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
export { createSalesforceViewsPlugin }
export type { SalesforceViewChange, SalesforceViewsPlugin } from '../domain/salesforce/salesforceViewsPlugin'

// eslint-disable-next-line local-rules/disallow-side-effects
export const datadogRum: DatadogRum = Object.assign(
  makeRumPublicApi(makeRecorderApiStub(), makeProfilerApiStub(), {
    sdkName: 'rum-slim',
  }),
  { createSalesforceViewsPlugin }
)

interface BrowserWindow extends Window {
  DD_RUM?: DatadogRum
}

// eslint-disable-next-line local-rules/disallow-side-effects
defineGlobal(getGlobalObject<BrowserWindow>(), 'DD_RUM', datadogRum)
