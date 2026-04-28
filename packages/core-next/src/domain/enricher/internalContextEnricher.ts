import type { Enricher } from './factory'

interface InternalContext {
  _dd: {
    format_version: 2
    browser_sdk_version?: string
    drift?: number
    configuration?: {
      session_sample_rate?: number
      session_replay_sample_rate?: number
      trace_sample_rate?: number
    }
  }
  application?: {
    id: string
  }
}

interface InternalContextOptions {
  sdkVersion?: string
  applicationId?: string
  sessionSampleRate?: number
  sessionReplaySampleRate?: number
  traceSampleRate?: number
}

function computeDrift(): number {
  return Math.round(Date.now() - (performance.timeOrigin + performance.now()))
}

function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}

function internalContextEnricher(
  options?: InternalContextOptions
): Enricher<Record<string, unknown>, Record<string, unknown> & InternalContext> {
  return {
    name: 'internal_context',
    transform(data) {
      const configuration: Record<string, number> = {}
      if (options?.sessionSampleRate !== undefined) {
        configuration.session_sample_rate = round(options.sessionSampleRate, 3)
      }
      if (options?.sessionReplaySampleRate !== undefined) {
        configuration.session_replay_sample_rate = round(options.sessionReplaySampleRate, 3)
      }
      if (options?.traceSampleRate !== undefined) {
        configuration.trace_sample_rate = round(options.traceSampleRate, 3)
      }

      return {
        ...data,
        ...(options?.applicationId && { application: { id: options.applicationId } }),
        _dd: {
          ...(data._dd as Record<string, unknown> | undefined),
          format_version: 2 as const,
          browser_sdk_version: options?.sdkVersion,
          drift: computeDrift(),
          ...(Object.keys(configuration).length > 0 && { configuration }),
        },
      }
    },
  }
}

export { internalContextEnricher }
export type { InternalContext, InternalContextOptions }
