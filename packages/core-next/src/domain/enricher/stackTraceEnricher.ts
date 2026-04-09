import type { Enricher } from './factory'
import { computeStackTrace } from '../error/computeStackTrace'
import { formatStackTrace } from '../error/formatStackTrace'

/**
 * Normalizes the `stack` field on resource events by parsing the raw `Error.stack`
 * string and re-serializing it into a consistent format across browsers.
 *
 * Reads the `error` field (raw Error object) if present, parses its stack,
 * and sets the `stack` field to the normalized string.
 *
 * Register on `resource:console` and `resource:runtime_error`.
 */
function stackTraceEnricher(): Enricher<Record<string, unknown>, Record<string, unknown>> {
  return {
    name: 'stackTrace',
    transform(data) {
      const error = data.error as Error | undefined
      if (!error) {
        return data
      }

      const trace = computeStackTrace(error)
      if (trace.stack.length === 0) {
        return data
      }

      return {
        ...data,
        stack: formatStackTrace(trace),
      }
    },
  }
}

export { stackTraceEnricher }
