import { defineGlobal, getGlobalObject } from '@datadog/browser-core'
import type { RumPublicApi } from '@datadog/browser-rum-core'
import { makeRumPublicApi } from '@datadog/browser-rum-core'
import { makeProfilerApiStub } from '../boot/stubProfilerApi'
import { makeRecorderApiStub } from '../boot/stubRecorderApi'
import { startSalesforceViewNameTracking } from '../domain/salesforce/viewNameTracker'

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

// eslint-disable-next-line local-rules/disallow-side-effects
export const datadogRum = createSalesforceDatadogRum(
  makeRumPublicApi(makeRecorderApiStub(), makeProfilerApiStub(), {
    sdkName: 'rum-slim',
  })
)

interface BrowserWindow extends Window {
  DD_RUM?: RumPublicApi
}

// eslint-disable-next-line local-rules/disallow-side-effects
defineGlobal(getGlobalObject<BrowserWindow>(), 'DD_RUM', datadogRum)

function createSalesforceDatadogRum(baseRum: RumPublicApi): RumPublicApi {
  const baseInit = baseRum.init
  let stopSalesforceViewNameTracking: (() => void) | undefined

  baseRum.init = (initConfiguration) => {
    baseInit(initConfiguration)

    if (!stopSalesforceViewNameTracking) {
      const salesforceViewNameTracking = startSalesforceViewNameTracking({
        getRumPublicApi: () => baseRum,
      })
      stopSalesforceViewNameTracking = () => salesforceViewNameTracking.stop()
    }
  }

  return baseRum
}
