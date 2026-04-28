import type { PropagatorType } from './propagation'

export type MatchOption = string | RegExp | ((url: string) => boolean)

export interface TracingOption {
  match: MatchOption
  propagatorTypes: PropagatorType[]
}

export const DEFAULT_PROPAGATOR_TYPES: PropagatorType[] = ['tracecontext', 'datadog']

type RawTracingInput = MatchOption | { match: MatchOption; propagatorTypes: PropagatorType[] }

export function normalizeTracingOptions(urls: RawTracingInput[]): TracingOption[] {
  return urls.map((entry) => {
    if (typeof entry === 'string' || entry instanceof RegExp || typeof entry === 'function') {
      return { match: entry, propagatorTypes: DEFAULT_PROPAGATOR_TYPES }
    }
    return entry
  })
}

export function findTracingOption(url: string, options: TracingOption[]): TracingOption | undefined {
  return options.find((option) => {
    const { match } = option

    if (typeof match === 'string') {
      return url.startsWith(match)
    }

    if (match instanceof RegExp) {
      return match.test(url)
    }

    return match(url)
  })
}
