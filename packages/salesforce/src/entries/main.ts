import { defineGlobal, getGlobalObject } from '@datadog/browser-core'
import { datadogRum as baseDatadogRum } from '@datadog/browser-rum'
import type { RumInitConfiguration, RumPublicApi } from '@datadog/browser-rum-core'
import { buildSalesforceInitConfiguration } from '../boot/salesforceInitConfiguration'
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
  DurationVitalReference,
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
  RumFetchResourceEventDomainContext,
  RumXhrResourceEventDomainContext,
  RumOtherResourceEventDomainContext,
  RumLongTaskEventDomainContext,
} from '@datadog/browser-rum-core'

export { DEFAULT_TRACKED_RESOURCE_HEADERS } from '@datadog/browser-rum-core'

const salesforceGlobal = getGlobalObject<BrowserWindow>()

/**
 * The global RUM instance. Use this to call RUM methods.
 *
 * @category Main
 * @see {@link DatadogRum}
 * @see [RUM Browser Monitoring Setup](https://docs.datadoghq.com/real_user_monitoring/browser/)
 */
export const datadogRum = createSalesforceDatadogRum(baseDatadogRum)

interface BrowserWindow extends Window {
  DD_RUM?: RumPublicApi
}

defineGlobal(salesforceGlobal, 'DD_RUM', datadogRum)

function createSalesforceDatadogRum(baseRum: RumPublicApi): RumPublicApi {
  const baseInit = baseRum.init
  let stopSalesforceViewTracking: (() => void) | undefined

  baseRum.init = (initConfiguration: RumInitConfiguration) => {
    baseInit(buildSalesforceInitConfiguration(initConfiguration))

    if (!stopSalesforceViewTracking) {
      const salesforceViewTracking = startSalesforceViewTracking({
        getRumPublicApi: () => baseRum,
      })
      stopSalesforceViewTracking = () => salesforceViewTracking.stop()
    }
  }

  return baseRum
}
