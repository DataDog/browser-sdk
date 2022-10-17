import type { Context } from '../../tools/context'
import { ConsoleApiName } from '../../tools/display'
import { toStackTraceString } from '../../tools/error'
import { assign, combine, jsonStringify, performDraw, includes, startsWith, arrayFrom } from '../../tools/utils'
import type { Configuration } from '../configuration'
import {
  isExperimentalFeatureEnabled,
  getExperimentalFeatures,
  getSimulationLabel,
  INTAKE_SITE_STAGING,
  INTAKE_SITE_US1_FED,
  isSimulationActive,
} from '../configuration'
import type { StackTrace } from '../tracekit'
import { computeStackTrace } from '../tracekit'
import { Observable } from '../../tools/observable'
import { timeStampNow } from '../../tools/timeUtils'
import { displayIfDebugEnabled, startMonitorErrorCollection } from '../../tools/monitor'
import type { TelemetryEvent } from './telemetryEvent.types'
import type { RawTelemetryConfiguration, RawTelemetryEvent } from './rawTelemetryEvent.types'
import { StatusType, TelemetryType } from './rawTelemetryEvent.types'

// replaced at build time
declare const __BUILD_ENV__SDK_VERSION__: string

const ALLOWED_FRAME_URLS = [
  'https://www.datadoghq-browser-agent.com',
  'https://www.datad0g-browser-agent.com',
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
}

const TELEMETRY_EXCLUDED_SITES: string[] = [INTAKE_SITE_US1_FED]

const telemetryConfiguration: {
  maxEventsPerPage: number
  sentEventCount: number
  telemetryEnabled: boolean
  telemetryConfigurationEnabled: boolean
} = { maxEventsPerPage: 0, sentEventCount: 0, telemetryEnabled: false, telemetryConfigurationEnabled: false }

let onRawTelemetryEventCollected: ((event: RawTelemetryEvent) => void) | undefined

export function startTelemetry(telemetryService: TelemetryService, configuration: Configuration): Telemetry {
  let contextProvider: () => Context
  const observable = new Observable<TelemetryEvent & Context>()

  telemetryConfiguration.telemetryEnabled = performDraw(configuration.telemetrySampleRate)
  telemetryConfiguration.telemetryConfigurationEnabled =
    telemetryConfiguration.telemetryEnabled && performDraw(configuration.telemetryConfigurationSampleRate)

  onRawTelemetryEventCollected = (event: RawTelemetryEvent) => {
    if (!includes(TELEMETRY_EXCLUDED_SITES, configuration.site) && telemetryConfiguration.telemetryEnabled) {
      observable.notify(toTelemetryEvent(telemetryService, event))
    }
  }
  startMonitorErrorCollection(addTelemetryError)

  assign(telemetryConfiguration, {
    maxEventsPerPage: configuration.maxTelemetryEventsPerPage,
    sentEventCount: 0,
  })

  function toTelemetryEvent(telemetryService: TelemetryService, event: RawTelemetryEvent): TelemetryEvent & Context {
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
        telemetry: event as any, // https://github.com/microsoft/TypeScript/issues/48457
        experimental_features: arrayFrom(getExperimentalFeatures()),
      },
      contextProvider !== undefined ? contextProvider() : {},
      isSimulationActive() ? { telemetry: { simulation_label: getSimulationLabel() } } : {}
    )
  }

  return {
    setContextProvider: (provider: () => Context) => {
      contextProvider = provider
    },
    observable,
  }
}

export function startFakeTelemetry() {
  const events: RawTelemetryEvent[] = []
  assign(telemetryConfiguration, {
    maxEventsPerPage: Infinity,
    sentEventCount: 0,
  })

  onRawTelemetryEventCollected = (event: RawTelemetryEvent) => {
    events.push(event)
  }

  return events
}

export function resetTelemetry() {
  onRawTelemetryEventCollected = undefined
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
  addTelemetry(
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

export function addTelemetryError(e: unknown) {
  addTelemetry(
    assign(
      {
        type: TelemetryType.log,
        status: StatusType.error,
      },
      formatError(e)
    )
  )
}

export function addTelemetryConfiguration(configuration: RawTelemetryConfiguration) {
  if (isExperimentalFeatureEnabled('telemetry_configuration') && telemetryConfiguration.telemetryConfigurationEnabled) {
    addTelemetry({
      type: TelemetryType.configuration,
      configuration,
    })
  }
}

function addTelemetry(event: RawTelemetryEvent) {
  if (onRawTelemetryEventCollected && telemetryConfiguration.sentEventCount < telemetryConfiguration.maxEventsPerPage) {
    telemetryConfiguration.sentEventCount += 1
    onRawTelemetryEventCollected(event)
  }
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
      stack: 'Not an instance of error',
    },
    message: `Uncaught ${jsonStringify(e)!}`,
  }
}

export function scrubCustomerFrames(stackTrace: StackTrace) {
  stackTrace.stack = stackTrace.stack.filter(
    (frame) => !frame.url || ALLOWED_FRAME_URLS.some((allowedFrameUrl) => startsWith(frame.url!, allowedFrameUrl))
  )
  return stackTrace
}
