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

const salesforceGlobal = getGlobalObject<BrowserWindow>()
sdkLog('global-object-ready', describeGlobalCandidates())

const baseRum = makeRumPublicApi(makeRecorderApiStub(), makeProfilerApiStub(), {
  sdkName: 'rum-slim',
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

sdkLog('define-global:start', describeGlobalCandidates())
defineGlobal(salesforceGlobal, 'DD_RUM', datadogRum)
sdkLog('define-global:done', describeRegisteredGlobal())

function describeGlobalCandidates() {
  return {
    hasGlobalThis: typeof globalThis === 'object',
    hasSelf: typeof self === 'object',
    hasWindow: typeof window === 'object',
    salesforceGlobalTag: safeCall(() => Object.prototype.toString.call(salesforceGlobal)),
    salesforceGlobalHasDdRum: Boolean(safeGet(salesforceGlobal, 'DD_RUM')),
  }
}

function describeRegisteredGlobal() {
  return {
    salesforceGlobalHasDdRum: Boolean(safeGet(salesforceGlobal, 'DD_RUM')),
    globalThisHasDdRum: typeof globalThis === 'object' ? Boolean(safeGet(globalThis, 'DD_RUM')) : undefined,
    selfHasDdRum: typeof self === 'object' ? Boolean(safeGet(self, 'DD_RUM')) : undefined,
    windowHasDdRum: typeof window === 'object' ? Boolean(safeGet(window, 'DD_RUM')) : undefined,
  }
}

function sdkLog(message: string, payload?: unknown) {
  if (typeof payload === 'undefined') {
    console.info(`[DD_RUM Salesforce] ${message}`)
    return
  }

  console.info(`[DD_RUM Salesforce] ${message}`, payload)
}

function safeGet(value: unknown, propertyName: string | symbol) {
  return safeCall(() => Reflect.get(value as object, propertyName))
}

function safeCall<T>(callback: () => T, fallbackValue?: T) {
  try {
    return callback()
  } catch {
    return fallbackValue as T
  }
}
