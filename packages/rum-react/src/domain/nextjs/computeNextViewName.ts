import type { NextParams } from './types'

/**
 * Reconstructs the parameterized route pattern from a Next.js pathname and params object.
 *
 * Uses segment-aware replacement to avoid matching param values as substrings of other
 * path segments. For example, `{ id: 'a' }` with `/abc/a/def` correctly produces
 * `/abc/:id/def` rather than `/:idbc/:id/def`.
 *
 * Processing order:
 * 1. Array (catch-all) params are processed before string params, so the full contiguous
 *    segment sequence can be matched before individual segments are replaced.
 * 2. String params are sorted by descending value length as a safety measure for edge cases
 *    where two params share values that are substrings of each other.
 */
export function computeNextViewName(pathname: string, params: NextParams): string {
  const segments = pathname.split('/')

  // Sort entries: arrays first, then strings sorted by descending length.
  // This ensures catch-all params are matched before individual segments,
  // and longer values are matched before shorter ones to avoid partial replacements.
  const entries = Object.entries(params).sort((a, b) => {
    const aIsArray = Array.isArray(a[1])
    const bIsArray = Array.isArray(b[1])
    if (aIsArray !== bIsArray) {
      return aIsArray ? -1 : 1
    }
    // For strings, sort by descending value length
    if (!aIsArray && !bIsArray) {
      return String(b[1] ?? '').length - String(a[1] ?? '').length
    }
    return 0
  })

  for (const [paramName, paramValue] of entries) {
    if (paramValue === undefined || paramValue === '') {
      continue
    }

    if (Array.isArray(paramValue)) {
      // Catch-all: find the first contiguous sequence of segments matching the array
      if (paramValue.length === 0) {
        continue
      }
      for (let i = 0; i <= segments.length - paramValue.length; i++) {
        let matches = true
        for (let j = 0; j < paramValue.length; j++) {
          if (segments[i + j] !== paramValue[j]) {
            matches = false
            break
          }
        }
        if (matches) {
          // Replace the contiguous run with a single :paramName segment
          segments.splice(i, paramValue.length, `:${paramName}`)
          break // Only replace the first occurrence for catch-all
        }
      }
    } else {
      // String: replace all matching segments
      for (let i = 0; i < segments.length; i++) {
        if (segments[i] === paramValue) {
          segments[i] = `:${paramName}`
        }
      }
    }
  }

  return segments.join('/')
}
