import type { Context } from '../../tools/serialisation/context'
import { ConsoleApiName } from '../../tools/display'
import { NO_ERROR_STACK_PRESENT_MESSAGE, isError } from '../error/error'
import { toStackTraceString } from '../../tools/stackTrace/handlingStack'
import { getExperimentalFeatures } from '../../tools/experimentalFeatures'
import type { Configuration } from '../configuration'
import { INTAKE_SITE_STAGING, INTAKE_SITE_US1_FED } from '../intakeSites'
import { BufferedObservable, Observable } from '../../tools/observable'
import { clocksNow } from '../../tools/utils/timeUtils'
import { displayIfDebugEnabled, startMonitorErrorCollection } from '../../tools/monitor'
import { sendToExtension } from '../../tools/sendToExtension'
import { performDraw } from '../../tools/utils/numberUtils'
import { jsonStringify } from '../../tools/serialisation/jsonStringify'
import { combine } from '../../tools/mergeInto'
import type { RawError } from '../error/error.types'
import { NonErrorPrefix } from '../error/error.types'
import type { StackTrace } from '../../tools/stackTrace/computeStackTrace'
import { computeStackTrace } from '../../tools/stackTrace/computeStackTrace'
import { getConnectivity } from '../connectivity'
import { canUseEventBridge, getEventBridge, startBatchWithReplica } from '../../transport'
import type { Encoder } from '../../tools/encoder'
import type { PageMayExitEvent } from '../../browser/pageMayExitObservable'
import { DeflateEncoderStreamId } from '../deflate'
import type { AbstractHooks, RecursivePartial } from '../../tools/abstractHooks'
import { HookNames, DISCARDED } from '../../tools/abstractHooks'
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
}

const TELEMETRY_EXCLUDED_SITES: string[] = [INTAKE_SITE_US1_FED]

let telemetryObservable: BufferedObservable<{ rawEvent: RawTelemetryEvent; kind: string }> | undefined

export function getTelemetryObservable() {
  if (!telemetryObservable) {
    telemetryObservable = new BufferedObservable(100)
  }
  return telemetryObservable
}

export function startTelemetry(
  telemetryService: TelemetryService,
  configuration: Configuration,
  hooks: AbstractHooks,
  reportError: (error: RawError) => void,
  pageMayExitObservable: Observable<PageMayExitEvent>,
  createEncoder: (streamId: DeflateEncoderStreamId) => Encoder
): Telemetry {
  const observable = new Observable<TelemetryEvent & Context>()

  const { stop } = startTelemetryTransport(configuration, reportError, pageMayExitObservable, createEncoder, observable)

  const { enabled } = startTelemetryCollection(telemetryService, configuration, hooks, observable)

  return {
    stop,
    enabled,
  }
}

export function startTelemetryCollection(
  telemetryService: TelemetryService,
  configuration: Configuration,
  hooks: AbstractHooks,
  observable: Observable<TelemetryEvent & Context>
) {
  const alreadySentEventsByKind: Record<string, Set<string>> = {}

  const telemetryEnabled =
    !TELEMETRY_EXCLUDED_SITES.includes(configuration.site) && performDraw(configuration.telemetrySampleRate)

  const telemetryEnabledPerType = {
    [TelemetryType.LOG]: telemetryEnabled,
    [TelemetryType.CONFIGURATION]: telemetryEnabled && performDraw(configuration.telemetryConfigurationSampleRate),
    [TelemetryType.USAGE]: telemetryEnabled && performDraw(configuration.telemetryUsageSampleRate),
  }

  const runtimeEnvInfo = getRuntimeEnvInfo()
  const telemetryObservable = getTelemetryObservable()
  telemetryObservable.subscribe(({ rawEvent, kind }) => {
    if (!telemetryEnabledPerType[rawEvent.type!]) {
      return
    }

    let alreadySentEvents = alreadySentEventsByKind[kind]
    if (!alreadySentEvents) {
      alreadySentEvents = alreadySentEventsByKind[kind] = new Set()
    }

    if (alreadySentEvents.size >= configuration.maxTelemetryEventsPerPage) {
      return
    }

    const stringifiedEvent = jsonStringify(rawEvent)!
    if (alreadySentEvents.has(stringifiedEvent)) {
      return
    }

    const defaultTelemetryEventAttributes = hooks.triggerHook(HookNames.AssembleTelemetry, {
      startTime: clocksNow().relative,
    })

    if (defaultTelemetryEventAttributes === DISCARDED) {
      return
    }

    const event = toTelemetryEvent(
      defaultTelemetryEventAttributes as RecursivePartial<TelemetryEvent>,
      telemetryService,
      rawEvent,
      runtimeEnvInfo
    )
    observable.notify(event)
    sendToExtension('telemetry', event)
    alreadySentEvents.add(stringifiedEvent)
  })
  telemetryObservable.unbuffer()

  startMonitorErrorCollection(addTelemetryError)

  return {
    enabled: telemetryEnabled,
  }

  function toTelemetryEvent(
    defaultTelemetryEventAttributes: RecursivePartial<TelemetryEvent>,
    telemetryService: TelemetryService,
    rawEvent: RawTelemetryEvent,
    runtimeEnvInfo: RuntimeEnvInfo
  ): TelemetryEvent & Context {
    const clockNow = clocksNow()

    const event = {
      type: 'telemetry' as const,
      date: clockNow.timeStamp,
      service: telemetryService,
      version: __BUILD_ENV__SDK_VERSION__,
      source: 'browser' as const,
      _dd: {
        format_version: 2 as const,
      },
      telemetry: combine(rawEvent, {
        runtime_env: runtimeEnvInfo,
        connectivity: getConnectivity(),
        sdk_setup: __BUILD_ENV__SDK_SETUP__,
      }) as TelemetryEvent['telemetry'],
      experimental_features: Array.from(getExperimentalFeatures()),
    }

    return combine(event, defaultTelemetryEventAttributes) as TelemetryEvent & Context
  }
}

function startTelemetryTransport(
  configuration: Configuration,
  reportError: (error: RawError) => void,
  pageMayExitObservable: Observable<PageMayExitEvent>,
  createEncoder: (streamId: DeflateEncoderStreamId) => Encoder,
  telemetryObservable: Observable<TelemetryEvent & Context>
) {
  const cleanupTasks: Array<() => void> = []
  if (canUseEventBridge()) {
    const bridge = getEventBridge<'internal_telemetry', TelemetryEvent>()!
    const telemetrySubscription = telemetryObservable.subscribe((event) => bridge.send('internal_telemetry', event))
    cleanupTasks.push(() => telemetrySubscription.unsubscribe())
  } else {
    const telemetryBatch = startBatchWithReplica(
      configuration,
      {
        endpoint: configuration.rumEndpointBuilder,
        encoder: createEncoder(DeflateEncoderStreamId.TELEMETRY),
      },
      configuration.replica && {
        endpoint: configuration.replica.rumEndpointBuilder,
        encoder: createEncoder(DeflateEncoderStreamId.TELEMETRY_REPLICA),
      },
      reportError,
      pageMayExitObservable,

      // We don't use an actual session expire observable here, to make telemetry collection
      // independent of the session. This allows to start and send telemetry events ealier.
      new Observable()
    )
    cleanupTasks.push(() => telemetryBatch.stop())
    const telemetrySubscription = telemetryObservable.subscribe((event) => {
      telemetryBatch.add(event, isTelemetryReplicationAllowed(configuration))
    })
    cleanupTasks.push(() => telemetrySubscription.unsubscribe())
  }

  return {
    stop: () => cleanupTasks.forEach((task) => task()),
  }
}

function getRuntimeEnvInfo(): RuntimeEnvInfo {
  return {
    is_local_file: window.location.protocol === 'file:',
    is_worker: 'WorkerGlobalScope' in self,
  }
}

export function resetTelemetry() {
  telemetryObservable = undefined
}

/**
 * Avoid mixing telemetry events from different data centers
 * but keep replicating staging events for reliability
 */
export function isTelemetryReplicationAllowed(configuration: Configuration) {
  return configuration.site === INTAKE_SITE_STAGING
}

export function addTelemetryDebug(message: string, context?: Context) {
  displayIfDebugEnabled(ConsoleApiName.debug, message, context)
  getTelemetryObservable().notify({
    rawEvent: {
      type: TelemetryType.LOG,
      message,
      status: StatusType.debug,
      ...context,
    },
    kind: StatusType.debug,
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
    kind: StatusType.error,
  })
}

export function addTelemetryConfiguration(configuration: RawTelemetryConfiguration) {
  getTelemetryObservable().notify({
    rawEvent: {
      type: TelemetryType.CONFIGURATION,
      configuration,
    },
    kind: TelemetryType.CONFIGURATION,
  })
}

export function addTelemetryMetrics(kind: string, context?: Context) {
  getTelemetryObservable().notify({
    rawEvent: {
      type: TelemetryType.LOG,
      message: kind,
      status: StatusType.debug,
      ...context,
    },
    kind,
  })
}

export function addTelemetryUsage(usage: RawTelemetryUsage) {
  getTelemetryObservable().notify({
    rawEvent: {
      type: TelemetryType.USAGE,
      usage,
    },
    kind: TelemetryType.USAGE,
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
