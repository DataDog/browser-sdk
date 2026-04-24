import { defineGlobal, getGlobalObject } from '@datadog/browser-core'
import type { RumPublicApi, RumInitConfiguration } from '@datadog/browser-rum-core'
import { makeRumPublicApi } from '@datadog/browser-rum-core'
import { buildSalesforceInitConfiguration } from '../boot/salesforceInitConfiguration'
import { makeProfilerApiStub } from '../boot/stubProfilerApi'
import { makeRecorderApiStub } from '../boot/stubRecorderApi'
import { startSalesforceViewTracking } from '../domain/salesforceViewTracker'

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
export type { RumPublicApi as DatadogRum } from '@datadog/browser-rum-core'

const salesforceGlobal = getGlobalObject<BrowserWindow>()

export const datadogRum = createSalesforceDatadogRum()

defineGlobal(salesforceGlobal, 'DD_RUM', datadogRum)

interface BrowserWindow extends Window {
  DD_RUM?: RumPublicApi
}

function createSalesforceDatadogRum(): RumPublicApi {
  const baseRum = makeRumPublicApi(makeRecorderApiStub(), makeProfilerApiStub(), {
    sdkName: 'rum-slim',
  })
  const baseInit = baseRum.init
  let stopSalesforceViewTracking: (() => void) | undefined

  baseRum.init = (initConfiguration: RumInitConfiguration) => {
    baseInit(buildSalesforceInitConfiguration(initConfiguration))

    if (!stopSalesforceViewTracking) {
      stopSalesforceViewTracking = startSalesforceViewTracking({
        getRumPublicApi: () => baseRum,
      }).stop
    }
  }

  return baseRum
}
