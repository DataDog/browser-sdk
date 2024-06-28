/* eslint-disable local-rules/disallow-side-effects */
import type { RelativeTime } from '@datadog/browser-core'
import { ONE_MINUTE, noop } from '@datadog/browser-core'
import { onLCP } from 'web-vitals/attribution'
import type { RumConfiguration } from '../../configuration'
import { getSelectorFromElement } from '../../getSelectorFromElement'

// Discard LCP timings above a certain delay to avoid incorrect data
// It happens in some cases like sleep mode or some browser implementations
export const LCP_MAXIMUM_DELAY = 10 * ONE_MINUTE

export interface LargestContentfulPaint {
  value: RelativeTime
  targetSelector?: string
}

/**
 * Track the largest contentful paint (LCP) occurring during the initial View.  This can yield
 * multiple values, only the most recent one should be used.
 * Documentation: https://web.dev/lcp/
 * Reference implementation: https://github.com/GoogleChrome/web-vitals/blob/master/src/onLCP.ts
 */
export function trackLargestContentfulPaint(
  configuration: RumConfiguration,
  callback: (largestContentfulPaint: LargestContentfulPaint) => void
) {
  onLCP(
    (lcp) => {
      const { lcpEntry, elementRenderDelay } = lcp.attribution

      if (!elementRenderDelay) {
        return
      }

      callback({
        value: lcp.value as RelativeTime,
        targetSelector:
          (lcpEntry &&
            lcpEntry.element &&
            getSelectorFromElement(lcpEntry.element, configuration.actionNameAttribute)) ||
          undefined,
      })
    },
    { reportAllChanges: true }
  )

  return {
    stop: noop,
  }
}
