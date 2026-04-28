import { normalizeTracingOptions } from '@datadog/core-next'
import type { Extension, TracingOption, PropagatorType } from '@datadog/core-next'

interface RumInitConfiguration {
  trackResources?: boolean
  trackLongTasks?: boolean
  trackErrors?: boolean
  allowedTracingUrls?: Array<
    | string
    | RegExp
    | { match: string | RegExp | ((url: string) => boolean); propagatorTypes?: PropagatorType[] }
  >
  traceSampleRate?: number
  traceContextInjection?: 'sampled' | 'all'
}

interface RumConfig {
  trackResources: boolean
  trackLongTasks: boolean
  trackErrors: boolean
  tracingOptions: TracingOption[]
  traceSampleRate: number
  traceContextInjection: 'sampled' | 'all'
}

const rumExtension: Extension<'rum', RumInitConfiguration, RumConfig> = {
  key: 'rum',
  validate(init: RumInitConfiguration | undefined): RumConfig | null {
    if (!init) return null

    const traceSampleRate = init.traceSampleRate ?? 100
    if (traceSampleRate < 0 || traceSampleRate > 100) {
      return null
    }

    return {
      trackResources: init.trackResources !== false,
      trackLongTasks: init.trackLongTasks !== false,
      trackErrors: init.trackErrors !== false,
      tracingOptions: init.allowedTracingUrls ? normalizeTracingOptions(init.allowedTracingUrls) : [],
      traceSampleRate,
      traceContextInjection: init.traceContextInjection ?? 'sampled',
    }
  },
}

export { rumExtension }
export type { RumInitConfiguration, RumConfig }
