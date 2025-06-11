/**
 * @packageDocumentation
 * Datadog Browser RUM SDK - Slim version without Session Replay and Real User Profiling.
 * Lightweight alternative for basic RUM monitoring with reduced bundle size.
 *
 * @see {@link https://docs.datadoghq.com/real_user_monitoring/browser/ | RUM Browser Monitoring Setup}
 */

import { defineGlobal, getGlobalObject } from '@datadog/browser-core'
import type { RumPublicApi } from '@datadog/browser-rum-core'
import { makeRumPublicApi, startRum } from '@datadog/browser-rum-core'
import { makeRecorderApiStub } from '../boot/stubRecorderApi'
import { makeProfilerApiStub } from '../boot/stubProfilerApi'

export type {
  CommonProperties,
  RumPublicApi as RumGlobal,
  RumInitConfiguration,
  // Events
  RumEvent,
  RumActionEvent,
  RumErrorEvent,
  RumLongTaskEvent,
  RumResourceEvent,
  RumViewEvent,
  // Events context
  RumEventDomainContext,
  RumViewEventDomainContext,
  RumErrorEventDomainContext,
  RumActionEventDomainContext,
  RumFetchResourceEventDomainContext,
  RumXhrResourceEventDomainContext,
  RumOtherResourceEventDomainContext,
  RumLongTaskEventDomainContext,
} from '@datadog/browser-rum-core'
export { DefaultPrivacyLevel } from '@datadog/browser-core'

/**
 * The global RUM instance (slim version without Session Replay and Profiling). Use this to call RUM methods.
 * @see {@link https://docs.datadoghq.com/real_user_monitoring/browser/ | RUM Browser Monitoring Setup}
 */
export const datadogRum = makeRumPublicApi(startRum, makeRecorderApiStub(), makeProfilerApiStub())

interface BrowserWindow extends Window {
  DD_RUM?: RumPublicApi
}
defineGlobal(getGlobalObject<BrowserWindow>(), 'DD_RUM', datadogRum)
