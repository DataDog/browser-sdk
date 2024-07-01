import type { RelativeTime } from '@datadog/browser-core'
import { ONE_MINUTE, noop } from '@datadog/browser-core'
// eslint-disable-next-line local-rules/disallow-side-effects
import { onFCP } from 'web-vitals/attribution'

// Discard FCP timings above a certain delay to avoid incorrect data
// It happens in some cases like sleep mode or some browser implementations
export const FCP_MAXIMUM_DELAY = 10 * ONE_MINUTE

export function trackFirstContentfulPaint(callback: (fcpTiming: RelativeTime) => void) {
  onFCP((fcp) => {
    callback(fcp.value as RelativeTime)
  })

  return {
    stop: noop,
  }
}
