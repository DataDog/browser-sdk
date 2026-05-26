import { defineGlobal, getGlobalObject } from '@datadog/browser-core'
import type { RumPublicApi } from '@datadog/browser-rum-core'
import { makeRumPublicApi } from '@datadog/browser-rum-core'
import { makeProfilerApi } from '../boot/profilerApi'
import { makeRecorderApi } from '../boot/recorderApi'
import { createDeflateEncoder, startDeflateWorker } from '../domain/deflate'
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

const salesforceGlobal = getGlobalObject<BrowserWindow>()

const recorderApi = makeRecorderApi()

const profilerApi = makeProfilerApi()

export const datadogRum = createSalesforceDatadogRum(
  makeRumPublicApi(recorderApi, profilerApi, {
    startDeflateWorker,
    createDeflateEncoder,
    sdkName: 'rum',
  })
)

interface BrowserWindow extends Window {
  DD_RUM?: RumPublicApi
}

defineGlobal(salesforceGlobal, 'DD_RUM', datadogRum)

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
