const MAX_EVENTS_PER_KIND = 15
const EXCLUDED_SITES = ['us1.ddog-gov.com']
const ALLOWED_FRAME_URLS = [
  'https://www.datadoghq-browser-agent.com',
  'https://www.datad0g-browser-agent.com',
  'https://d3uc069fcn7uxw.cloudfront.net',
  'https://d20xtzwzcl0ceb.cloudfront.net',
  'http://localhost',
  '<anonymous>',
]

function scrubStackTrace(stack: string): string {
  return stack
    .split('\n')
    .filter((line) => !line.includes('at ') || ALLOWED_FRAME_URLS.some((url) => line.includes(url)))
    .join('\n')
}

function extractStack(error: unknown): string | undefined {
  if (!(error instanceof Error) || !error.stack) {
    return undefined
  }
  return scrubStackTrace(error.stack)
}

import type { Configuration } from '../configuration/configuration'

type TelemetryConfig = Pick<
  Configuration,
  'site' | 'telemetrySampleRate' | 'telemetryConfigurationSampleRate' | 'telemetryUsageSampleRate'
>

interface TelemetryLogEvent {
  type: 'log'
  status: 'debug' | 'error'
  message: string
  error?: unknown
}

interface TelemetryUsageEvent {
  type: 'usage'
  feature: string
}

interface TelemetryConfigurationEvent {
  type: 'configuration'
  configuration: object
}

type TelemetryEvent = (TelemetryLogEvent | TelemetryUsageEvent | TelemetryConfigurationEvent) & Record<string, unknown>

function isSampled(rate: number) {
  return rate >= 100 || Math.random() * 100 < rate
}

class Telemetry {
  private readonly enabled: boolean
  private readonly usageEnabled: boolean
  private readonly configurationEnabled: boolean
  private readonly eventCountByKind = new Map<string, number>()
  private readonly sentEventsByKind = new Map<string, Set<string>>()
  private readonly contextProviders: (() => Record<string, unknown>)[] = []

  constructor(
    private readonly config: TelemetryConfig,
    private readonly onEvent: (event: TelemetryEvent) => void
  ) {
    const sampled = isSampled(config.telemetrySampleRate)
    this.enabled = !EXCLUDED_SITES.includes(config.site) && sampled
    this.usageEnabled = this.enabled && isSampled(config.telemetryUsageSampleRate ?? 100)
    this.configurationEnabled = this.enabled && isSampled(config.telemetryConfigurationSampleRate ?? 100)
  }

  registerContext(provider: () => Record<string, unknown>): void {
    this.contextProviders.push(provider)
  }

  debug(message: string, context?: object): void {
    if (!this.enabled) {
      return
    }
    this.send({ type: 'log', status: 'debug', message, ...context })
  }

  error(message: string, error?: unknown): void {
    if (!this.enabled) {
      return
    }
    const stack = extractStack(error)
    this.send({ type: 'log', status: 'error', message, error, ...(stack !== undefined && { stack }) })
  }

  usage(feature: string): void {
    if (!this.usageEnabled) {
      return
    }
    this.send({ type: 'usage', feature })
  }

  configuration(configuration: object): void {
    if (!this.configurationEnabled) {
      return
    }
    this.send({ type: 'configuration', configuration })
  }

  private send(rawEvent: TelemetryLogEvent | TelemetryUsageEvent | TelemetryConfigurationEvent): void {
    const kind = rawEvent.type === 'log' ? `log:${rawEvent.status}` : rawEvent.type

    const count = this.eventCountByKind.get(kind) ?? 0
    if (count >= MAX_EVENTS_PER_KIND) {
      return
    }

    const serialized = JSON.stringify(rawEvent)
    let sent = this.sentEventsByKind.get(kind)
    if (!sent) {
      sent = new Set()
      this.sentEventsByKind.set(kind, sent)
    }
    if (sent.has(serialized)) {
      return
    }

    const context = this.contextProviders.reduce<Record<string, unknown>>(
      (acc, provider) => ({ ...acc, ...provider() }),
      {}
    )

    const event = { ...rawEvent, ...context } as TelemetryEvent

    this.eventCountByKind.set(kind, count + 1)
    sent.add(serialized)
    this.onEvent(event)
  }
}

export type { TelemetryConfig, TelemetryEvent }
export { Telemetry }
