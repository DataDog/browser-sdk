import type { Context } from '../../tools/serialisation/context'
import { ConsoleApiName } from '../../tools/display'
import { NO_ERROR_STACK_PRESENT_MESSAGE } from '../error/error'
import { toStackTraceString } from '../../tools/stackTrace/handlingStack'
import { getExperimentalFeatures } from '../../tools/experimentalFeatures'
import type { Configuration } from '../configuration'
import { INTAKE_SITE_STAGING, INTAKE_SITE_US1_FED } from '../configuration'
import { Observable } from '../../tools/observable'
import { timeStampNow } from '../../tools/utils/timeUtils'
import { displayIfDebugEnabled, startMonitorErrorCollection } from '../../tools/monitor'
import { sendToExtension } from '../../tools/sendToExtension'
import { startsWith, arrayFrom, includes, assign } from '../../tools/utils/polyfills'
import { performDraw } from '../../tools/utils/numberUtils'
import { jsonStringify } from '../../tools/serialisation/jsonStringify'
import { combine } from '../../tools/mergeInto'
import { NonErrorPrefix } from '../error/error.types'
import type { StackTrace } from '../../tools/stackTrace/computeStackTrace'
import { computeStackTrace } from '../../tools/stackTrace/computeStackTrace'
import { getConnectivity } from '../connectivity'
import { BoundedBuffer } from '../../tools/boundedBuffer'
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
  setContextProvider: (provider: () => Context) => void
  observable: Observable<TelemetryEvent & Context>
  enabled: boolean
}

const TELEMETRY_EXCLUDED_SITES: string[] = [INTAKE_SITE_US1_FED]

// eslint-disable-next-line local-rules/disallow-side-effects
let preStartTelemetryBuffer = new BoundedBuffer()
let onRawTelemetryEventCollected = (event: RawTelemetryEvent) => {
  preStartTelemetryBuffer.add(() => onRawTelemetryEventCollected(event))
}

export function startTelemetry(telemetryService: TelemetryService, configuration: Configuration): Telemetry {
  let contextProvider: () => Context
  const observable = new Observable<TelemetryEvent & Context>()
  const alreadySentEvents = new Set<string>()

  const telemetryEnabled =
    !includes(TELEMETRY_EXCLUDED_SITES, configuration.site) && performDraw(configuration.telemetrySampleRate)

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
    event: RawTelemetryEvent,
    runtimeEnvInfo: RuntimeEnvInfo
  ): TelemetryEvent & Context {
    return combine(
      {
        type: 'telemetry' as const,
        date: timeStampNow(),
        service: telemetryService,
        version: __BUILD_ENV__SDK_VERSION__,
        source: 'browser' as const,
        _dd: {
          format_version: 2 as const,
        },
        telemetry: combine(event, {
          runtime_env: runtimeEnvInfo,
          connectivity: getConnectivity(),
        }),
        experimental_features: arrayFrom(getExperimentalFeatures()),
      },
      contextProvider !== undefined ? contextProvider() : {}
    ) as TelemetryEvent & Context
  }

  return {
    setContextProvider: (provider: () => Context) => {
      contextProvider = provider
    },
    observable,
    enabled: telemetryEnabled,
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
  preStartTelemetryBuffer = new BoundedBuffer()
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
  onRawTelemetryEventCollected(
    assign(
      {
        type: TelemetryType.log,
        message,
        status: StatusType.debug,
      },
      context
    )
  )
}

export function addTelemetryError(e: unknown, context?: Context) {
  onRawTelemetryEventCollected(
    assign(
      {
        type: TelemetryType.log,
        status: StatusType.error,
      },
      formatError(e),
      context
    )
  )
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
  if (e instanceof Error) {
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
    (frame) => !frame.url || ALLOWED_FRAME_URLS.some((allowedFrameUrl) => startsWith(frame.url!, allowedFrameUrl))
  )
  return stackTrace
}
