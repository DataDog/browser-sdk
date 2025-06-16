/**
 * @packageDocumentation
 * Datadog Browser RUM SDK - Full version with Session Replay and Real User Profiling capabilities.
 * Use this package to monitor your web application's performance and user experience.
 *
 * @see {@link https://docs.datadoghq.com/real_user_monitoring/browser/ | RUM Browser Monitoring Setup}
 */

// Keep the following in sync with packages/rum-slim/src/entries/main.ts
import { defineGlobal, getGlobalObject } from '@datadog/browser-core'
import type { RumPublicApi } from '@datadog/browser-rum-core'
import { makeRumPublicApi, startRum } from '@datadog/browser-rum-core'
import { makeRecorderApi } from '../boot/recorderApi'
import { createDeflateEncoder, startDeflateWorker } from '../domain/deflate'
import { lazyLoadRecorder } from '../boot/lazyLoadRecorder'
import { makeProfilerApi } from '../boot/profilerApi'
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
  RumVitalEvent,
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

const recorderApi = makeRecorderApi(lazyLoadRecorder)

const profilerApi = makeProfilerApi()

/**
 * The global RUM instance. Use this to call RUM methods.
 * @see {@link https://docs.datadoghq.com/real_user_monitoring/browser/ | RUM Browser Monitoring Setup}
 */
export const datadogRum = makeRumPublicApi(startRum, recorderApi, profilerApi, {
  startDeflateWorker,
  createDeflateEncoder,
  sdkName: 'rum',
})

interface BrowserWindow extends Window {
  DD_RUM?: RumPublicApi
}
defineGlobal(getGlobalObject<BrowserWindow>(), 'DD_RUM', datadogRum)
