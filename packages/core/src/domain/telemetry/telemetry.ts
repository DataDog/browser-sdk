import type { Context, ContextValue } from '../../tools/serialisation/context'
import { ConsoleApiName } from '../../tools/display'
import { NO_ERROR_STACK_PRESENT_MESSAGE, isError } from '../error/error'
import { toStackTraceString } from '../../tools/stackTrace/handlingStack'
import { getExperimentalFeatures } from '../../tools/experimentalFeatures'
import type { Configuration } from '../configuration'
import { INTAKE_SITE_STAGING, INTAKE_SITE_US1_FED } from '../configuration'
import { Observable } from '../../tools/observable'
import { timeStampNow } from '../../tools/utils/timeUtils'
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
import { createBoundedBuffer } from '../../tools/boundedBuffer'
import { canUseEventBridge, getEventBridge, startBatchWithReplica } from '../../transport'
import type { Encoder } from '../../tools/encoder'
import type { PageMayExitEvent } from '../../browser/pageMayExitObservable'
import { DeflateEncoderStreamId } from '../deflate'
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
  setContextProvider: (key: string, contextProvider: () => ContextValue | undefined) => void
  observable: Observable<TelemetryEvent & Context>
  enabled: boolean
}

const TELEMETRY_EXCLUDED_SITES: string[] = [INTAKE_SITE_US1_FED]

// eslint-disable-next-line local-rules/disallow-side-effects
let preStartTelemetryBuffer = createBoundedBuffer()
let onRawTelemetryEventCollected = (event: RawTelemetryEvent) => {
  preStartTelemetryBuffer.add(() => onRawTelemetryEventCollected(event))
}

export function startTelemetry(telemetryService: TelemetryService, configuration: Configuration): Telemetry {
  const observable = new Observable<TelemetryEvent & Context>()
  const alreadySentEvents = new Set<string>()
  const contextProviders = new Map<string, () => ContextValue | undefined>()

  const telemetryEnabled =
    !TELEMETRY_EXCLUDED_SITES.includes(configuration.site) && performDraw(configuration.telemetrySampleRate)

  const telemetryEnabledPerType = {
    [TelemetryType.log]: telemetryEnabled,
    [TelemetryType.configuration]: telemetryEnabled && performDraw(configuration.telemetryConfigurationSampleRate),
    [TelemetryType.usage]: telemetryEnabled && performDraw(configuration.telemetryUsageSampleRate),
  }

  const runtimeEnvInfo = getRuntimeEnvInfo()
  onRawTelemetryEventCollected = (rawEvent: RawTelemetryEvent) => {
    const stringifiedEvent = jsonStringify(rawEvent)!
    if (
      telemetryEnabledPerType[rawEvent.type!] &&
      alreadySentEvents.size < configuration.maxTelemetryEventsPerPage &&
      !alreadySentEvents.has(stringifiedEvent)
    ) {
      const event = toTelemetryEvent(telemetryService, rawEvent, runtimeEnvInfo)
      observable.notify(event)
      sendToExtension('telemetry', event)
      alreadySentEvents.add(stringifiedEvent)
    }
  }
  startMonitorErrorCollection(addTelemetryError)

  function toTelemetryEvent(
    telemetryService: TelemetryService,
    rawEvent: RawTelemetryEvent,
    runtimeEnvInfo: RuntimeEnvInfo
  ): TelemetryEvent & Context {
    const event = {
      type: 'telemetry' as const,
      date: timeStampNow(),
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
    } as TelemetryEvent & Context

    for (const [key, contextProvider] of contextProviders) {
      event[key] = contextProvider()
    }

    return event
  }

  return {
    setContextProvider: (key, contextProvider) => contextProviders.set(key, contextProvider),
    observable,
    enabled: telemetryEnabled,
  }
}

export function startTelemetryTransport(
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
    const telemetrySubscription = telemetryObservable.subscribe((event) =>
      telemetryBatch.add(event, isTelemetryReplicationAllowed(configuration))
    )
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

export function startFakeTelemetry() {
  const events: RawTelemetryEvent[] = []

  onRawTelemetryEventCollected = (event: RawTelemetryEvent) => {
    events.push(event)
  }

  return events
}

// need to be called after telemetry context is provided and observers are registered
export function drainPreStartTelemetry() {
  preStartTelemetryBuffer.drain()
}

export function resetTelemetry() {
  preStartTelemetryBuffer = createBoundedBuffer()
  onRawTelemetryEventCollected = (event: RawTelemetryEvent) => {
    preStartTelemetryBuffer.add(() => onRawTelemetryEventCollected(event))
  }
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
  onRawTelemetryEventCollected({
    type: TelemetryType.log,
    message,
    status: StatusType.debug,
    ...context,
  })
}

export function addTelemetryError(e: unknown, context?: Context) {
  onRawTelemetryEventCollected({
    type: TelemetryType.log,
    status: StatusType.error,
    ...formatError(e),
    ...context,
  })
}

export function addTelemetryConfiguration(configuration: RawTelemetryConfiguration) {
  onRawTelemetryEventCollected({
    type: TelemetryType.configuration,
    configuration,
  })
}

export function addTelemetryUsage(usage: RawTelemetryUsage) {
  onRawTelemetryEventCollected({
    type: TelemetryType.usage,
    usage,
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
