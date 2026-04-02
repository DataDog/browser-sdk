import type { Configuration } from '../configuration/configuration'

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

type TelemetryConfig = Pick<
  Configuration,
  'site' | 'telemetrySampleRate' | 'telemetryConfigurationSampleRate' | 'telemetryUsageSampleRate'
>

interface RawTelemetryLog {
  type: 'log'
  status: 'debug' | 'error'
  message: string
  error?: { stack?: string; kind?: string }
}

interface RawTelemetryUsage {
  type: 'usage'
  usage: Record<string, unknown>
}

interface RawTelemetryConfiguration {
  type: 'configuration'
  configuration: object
}

type RawTelemetry = RawTelemetryLog | RawTelemetryUsage | RawTelemetryConfiguration

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
    config: TelemetryConfig,
    private readonly onEvent: (event: RawTelemetry & Record<string, unknown>) => void
  ) {
    const sampled = isSampled(config.telemetrySampleRate)
    this.enabled = !EXCLUDED_SITES.includes(config.site) && sampled
    this.usageEnabled = this.enabled && isSampled(config.telemetryUsageSampleRate)
    this.configurationEnabled = this.enabled && isSampled(config.telemetryConfigurationSampleRate)
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
    const kind = error instanceof Error ? error.name : undefined
    this.send({
      type: 'log',
      status: 'error',
      message,
      ...(stack !== undefined || kind !== undefined ? { error: { stack, kind } } : {}),
    })
  }

  usage(feature: string): void {
    if (!this.usageEnabled) {
      return
    }
    this.send({ type: 'usage', usage: { [feature]: true } })
  }

  configuration(configuration: object): void {
    if (!this.configurationEnabled) {
      return
    }
    this.send({ type: 'configuration', configuration })
  }

  private send(rawTelemetry: RawTelemetry): void {
    const kind = rawTelemetry.type === 'log' ? `log:${rawTelemetry.status}` : rawTelemetry.type

    const count = this.eventCountByKind.get(kind) ?? 0
    if (count >= MAX_EVENTS_PER_KIND) {
      return
    }

    const serialized = JSON.stringify(rawTelemetry)
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

    const event = { ...rawTelemetry, ...context } as RawTelemetry & Record<string, unknown>

    this.eventCountByKind.set(kind, count + 1)
    sent.add(serialized)
    this.onEvent(event)
  }
}

export type { TelemetryConfig, RawTelemetry }
export { Telemetry }
