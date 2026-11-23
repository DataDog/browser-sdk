import { clocksNow } from '@datadog/js-core/time'
import {
  getDebugMode,
  combine,
  globalObject,
  isWorkerEnvironment,
  jsonStringify,
  BufferedObservable,
  Observable,
  noop,
} from '@datadog/js-core/util'
import type { Hook } from '@datadog/js-core/assembly'
import type { RecursivePartial, Context } from '@datadog/js-core/util'
import { DISCARDED } from '@datadog/js-core/assembly'
import { performDraw } from '@datadog/js-core/sample'
import {
  createEndpointBuilder,
  createReplicaEndpointBuilder,
  INTAKE_SITE_STAGING,
  INTAKE_SITE_US1_FED,
  INTAKE_SITE_US2_FED,
} from '@datadog/js-core/transport'
import { startMonitorErrorCollection } from '@datadog/js-core/monitor'
import { NO_ERROR_STACK_PRESENT_MESSAGE, isError } from '../error/isError'
import { toStackTraceString } from '../../tools/stackTrace/handlingStack'
import { getExperimentalFeatures } from '../../tools/experimentalFeatures'
import type { Configuration } from '../configuration'
import { buildTags } from '../tags'
import { display } from '../../tools/display'
import { sendToExtension } from '../../tools/sendToExtension'
import { NonErrorPrefix } from '../error/error.types'
import type { StackTrace } from '../../tools/stackTrace/computeStackTrace'
import { computeStackTrace } from '../../tools/stackTrace/computeStackTrace'
import { getConnectivity } from '../connectivity'
import { canUseEventBridge, getEventBridge, createBatch } from '../../transport'
import type { TelemetryEvent } from './telemetryEvent.types'
import type {
  RawTelemetryConfiguration,
  RawTelemetryEvent,
  RuntimeEnvInfo,
  RawTelemetryUsage,
} from './rawTelemetryEvent.types'
import { StatusType, TelemetryType } from './rawTelemetryEvent.types'

// replaced at build time
declare const __BUILD_ENV__SDK_VERSION__: string
declare const __BUILD_ENV__SDK_SETUP__: string

const ALLOWED_FRAME_URLS = [
  'https://www.datadoghq-browser-agent.com',
  'https://www.datad0g-browser-agent.com',
  'https://d3uc069fcn7uxw.cloudfront.net',
  'https://d20xtzwzcl0ceb.cloudfront.net',
  'http://localhost',
  '<anonymous>',
]

export const enum TelemetryService {
  LOGS = 'browser-logs-sdk',
  RUM = 'browser-rum-sdk',
}

export interface Telemetry {
  stop: () => void
  enabled: boolean
  metricsEnabled: boolean
}

export const enum TelemetryMetrics {
  CUSTOMER_DATA_METRIC_NAME = 'Customer data measures',
  REMOTE_CONFIGURATION_METRIC_NAME = 'remote configuration metrics',
  RECORDER_INIT_METRICS_TELEMETRY_NAME = 'Recorder init metrics',
  SEGMENT_METRICS_TELEMETRY_NAME = 'Segment network request metrics',
  SESSION_MANAGER_INIT_METRICS_TELEMETRY_NAME = 'Session manager init metrics',
}

const METRIC_SAMPLE_RATE = 1

const TELEMETRY_EXCLUDED_SITES: string[] = [INTAKE_SITE_US1_FED, INTAKE_SITE_US2_FED]
const MAX_TELEMETRY_EVENTS_PER_PAGE = 15

let telemetryObservable:
  BufferedObservable<{ rawEvent: RawTelemetryEvent; metricName?: string; isCrossPlatform?: boolean }> | undefined

export function getTelemetryObservable() {
  if (!telemetryObservable) {
    telemetryObservable = new BufferedObservable(100)
  }
  return telemetryObservable
}

export function startTelemetry(
  telemetryService: TelemetryService,
  configuration: Configuration,
  hook: Hook<any, any>,
  sdkName?: string
): Telemetry {
  const observable = new Observable<TelemetryEvent & Context>()
  const { enabled, metricsEnabled } = startTelemetryCollection(
    telemetryService,
    configuration,
    hook,
    observable,
    sdkName
  )
  const { stop } = startTelemetryTransport(configuration, observable)
  return {
    stop,
    enabled,
    metricsEnabled,
  }
}

export function startTelemetryCollection(
  telemetryService: TelemetryService,
  configuration: Configuration,
  hook: Hook<any, any>,
  observable: Observable<TelemetryEvent & Context>,
  sdkName?: string,
  metricSampleRate = METRIC_SAMPLE_RATE,
  maxTelemetryEventsPerPage = MAX_TELEMETRY_EVENTS_PER_PAGE
) {
  const alreadySentEventsByKind: Record<string, Set<string>> = {}

  const telemetryEnabled =
    !TELEMETRY_EXCLUDED_SITES.includes(configuration.site) && performDraw(configuration.telemetrySampleRate)

  const telemetryEnabledPerType = {
    [TelemetryType.LOG]: telemetryEnabled,
    [TelemetryType.CONFIGURATION]: telemetryEnabled && performDraw(configuration.telemetryConfigurationSampleRate),
    [TelemetryType.USAGE]: telemetryEnabled && performDraw(configuration.telemetryUsageSampleRate),
    // not an actual "type" but using a single draw for all metrics
    metric: telemetryEnabled && performDraw(metricSampleRate),
  }

  const runtimeEnvInfo = getRuntimeEnvInfo()
  const telemetryObservable = getTelemetryObservable()
  telemetryObservable.subscribe(({ rawEvent, metricName, isCrossPlatform }) => {
    if ((metricName && !telemetryEnabledPerType['metric']) || !telemetryEnabledPerType[rawEvent.type!]) {
      return
    }

    const kind = metricName || (rawEvent.status as string | undefined) || rawEvent.type!
    let alreadySentEvents = alreadySentEventsByKind[kind]
    if (!alreadySentEvents) {
      alreadySentEvents = alreadySentEventsByKind[kind] = new Set()
    }

    if (alreadySentEvents.size >= maxTelemetryEventsPerPage) {
      return
    }

    // Include the cross-platform attribution in the key: a cross-platform SDK event and a browser
    // event carrying the same message are distinct telemetry events and should both be sent.
    const stringifiedEvent = jsonStringify({ rawEvent, isCrossPlatform })!
    if (alreadySentEvents.has(stringifiedEvent)) {
      return
    }

    const defaultTelemetryEventAttributes = hook.trigger({
      startTime: clocksNow().relative,
    })

    if (defaultTelemetryEventAttributes === DISCARDED) {
      return
    }
    const event = toTelemetryEvent(
      defaultTelemetryEventAttributes as RecursivePartial<TelemetryEvent>,
      telemetryService,
      rawEvent,
      runtimeEnvInfo,
      isCrossPlatform
    )
    observable.notify(event)
    sendToExtension('telemetry', event)
    alreadySentEvents.add(stringifiedEvent)
  })
  telemetryObservable.unbuffer()

  startMonitorErrorCollection(addTelemetryError)

  return {
    enabled: telemetryEnabled,
    metricsEnabled: telemetryEnabledPerType['metric'],
  }

  function toTelemetryEvent(
    defaultTelemetryEventAttributes: RecursivePartial<TelemetryEvent>,
    telemetryService: TelemetryService,
    rawEvent: RawTelemetryEvent,
    runtimeEnvInfo: RuntimeEnvInfo,
    isCrossPlatform?: boolean
  ): TelemetryEvent & Context {
    const clockNow = clocksNow()

    const event = {
      type: 'telemetry' as const,
      date: clockNow.timeStamp,
      service: telemetryService,
      // Telemetry sent by a cross-platform SDK (Flutter, Unity) is attributed to that SDK
      version: (isCrossPlatform && configuration.sdkVersion) || __BUILD_ENV__SDK_VERSION__,
      source: isCrossPlatform ? configuration.source : ('browser' as const),
      _dd: {
        format_version: 2 as const,
      },
      telemetry: combine(rawEvent, {
        runtime_env: runtimeEnvInfo,
        connectivity: getConnectivity(),
        sdk_setup: __BUILD_ENV__SDK_SETUP__,
        sdk_name: sdkName,
      }) as TelemetryEvent['telemetry'],
      ddtags: buildTags(configuration).join(','),
      experimental_features: Array.from(getExperimentalFeatures()),
    }

    return combine(event, defaultTelemetryEventAttributes) as TelemetryEvent & Context
  }
}

export function startTelemetryTransport(
  configuration: Configuration,
  telemetryObservable: Observable<TelemetryEvent & Context>
) {
  const cleanupTasks: Array<() => void> = []
  if (canUseEventBridge()) {
    const bridge = getEventBridge<'internal_telemetry', TelemetryEvent>()!
    const telemetrySubscription = telemetryObservable.subscribe((event) => bridge.send('internal_telemetry', event))
    cleanupTasks.push(telemetrySubscription.unsubscribe)
  } else {
    const endpoints = [createEndpointBuilder(configuration, 'rum')]
    const replicaEndpoint = createReplicaEndpointBuilder(configuration, 'rum')
    if (replicaEndpoint && isTelemetryReplicationAllowed(configuration)) {
      endpoints.push(replicaEndpoint)
    }
    const telemetryBatch = createBatch({
      endpoints,
      // Ignore transport errors for telemetry
      reportError: noop,
    })
    cleanupTasks.push(telemetryBatch.stop)
    const telemetrySubscription = telemetryObservable.subscribe(telemetryBatch.add)
    cleanupTasks.push(telemetrySubscription.unsubscribe)
  }

  return {
    stop: () => cleanupTasks.forEach((task) => task()),
  }
}

function getRuntimeEnvInfo(): RuntimeEnvInfo {
  return {
    is_local_file: globalObject.location?.protocol === 'file:',
    is_worker: isWorkerEnvironment,
  }
}

export function resetTelemetry() {
  telemetryObservable = undefined
}

/**
 * Avoid mixing telemetry events from different data centers
 * but keep replicating staging events for reliability
 */
function isTelemetryReplicationAllowed(configuration: Configuration) {
  return configuration.site === INTAKE_SITE_STAGING
}

export function addTelemetryDebug(message: string, context?: Context) {
  if (getDebugMode()) {
    display.debug('[Telemetry]', message, context)
  }
  getTelemetryObservable().notify({
    rawEvent: {
      type: TelemetryType.LOG,
      message,
      status: StatusType.debug,
      ...context,
    },
  })
}

export function addTelemetryError(e: unknown, context?: Context) {
  getTelemetryObservable().notify({
    rawEvent: {
      type: TelemetryType.LOG,
      status: StatusType.error,
      ...formatError(e),
      ...context,
    },
  })
}

/**
 * Telemetry event sent through the plugin API.
 *
 * New event kinds can be added to this union without changing the plugin API signature: the
 * browser SDK drops kinds it doesn't know about, so SDKs relying on newer kinds keep working with
 * older browser SDK versions.
 */
export type PluginTelemetryEvent =
  | { type: 'debug'; message: string; context?: Context }
  | { type: 'error'; message: string; stack?: string; kind?: string; context?: Context }

export interface AddPluginTelemetryOptions {
  /**
   * The event is sent on behalf of a cross-platform SDK (Flutter, Unity) running the browser SDK:
   * it is attributed to the `source` and `sdkVersion` init options instead of the browser SDK.
   */
  crossPlatformSdk?: boolean
}

/**
 * Send a telemetry event through the plugin API. The error stack is sent as is (no frame
 * scrubbing), like on mobile platforms: scrubCustomerFrames would drop all of the frames of a
 * cross-platform SDK stack, as none are served from the Datadog CDN.
 */
export function addPluginTelemetry(event: PluginTelemetryEvent, options?: AddPluginTelemetryOptions) {
  const rawEvent = toPluginRawEvent(event)
  if (!rawEvent) {
    return
  }
  getTelemetryObservable().notify({ rawEvent, isCrossPlatform: options?.crossPlatformSdk })
}

function toPluginRawEvent(event: PluginTelemetryEvent): RawTelemetryEvent | undefined {
  switch (event.type) {
    case 'debug':
      return {
        type: TelemetryType.LOG,
        message: event.message,
        status: StatusType.debug,
        ...event.context,
      }
    case 'error':
      return {
        type: TelemetryType.LOG,
        status: StatusType.error,
        message: event.message,
        error: { stack: event.stack, kind: event.kind },
        ...event.context,
      }
  }
  // The union is closed at compile time, so this is only reachable with an event kind unknown to
  // this SDK version, sent by an SDK built against a newer browser SDK.
  return undefined
}

export function addTelemetryConfiguration(configuration: RawTelemetryConfiguration) {
  getTelemetryObservable().notify({
    rawEvent: {
      type: TelemetryType.CONFIGURATION,
      configuration,
    },
  })
}

export function addTelemetryMetrics(metricName: TelemetryMetrics, context?: Context) {
  getTelemetryObservable().notify({
    rawEvent: {
      type: TelemetryType.LOG,
      message: metricName,
      status: StatusType.debug,
      ...context,
    },
    metricName,
  })
}

export function addTelemetryUsage(usage: RawTelemetryUsage) {
  getTelemetryObservable().notify({
    rawEvent: {
      type: TelemetryType.USAGE,
      usage,
    },
  })
}

export function formatError(e: unknown) {
  if (isError(e)) {
    const stackTrace = computeStackTrace(e)
    return {
      error: {
        kind: stackTrace.name,
        stack: toStackTraceString(scrubCustomerFrames(stackTrace)),
      },
      message: stackTrace.message!,
    }
  }
  return {
    error: {
      stack: NO_ERROR_STACK_PRESENT_MESSAGE,
    },
    message: `${NonErrorPrefix.UNCAUGHT} ${jsonStringify(e)!}`,
  }
}

export function scrubCustomerFrames(stackTrace: StackTrace) {
  stackTrace.stack = stackTrace.stack.filter(
    (frame) => !frame.url || ALLOWED_FRAME_URLS.some((allowedFrameUrl) => frame.url!.startsWith(allowedFrameUrl))
  )
  return stackTrace
}
