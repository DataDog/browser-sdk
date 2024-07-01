import type { Duration, RelativeTime } from '@datadog/browser-core'
import { noop } from '@datadog/browser-core'
// eslint-disable-next-line local-rules/disallow-side-effects
import { onFID } from 'web-vitals/attribution'
import { isElementNode } from '../../../browser/htmlDomUtils'
import type { RumConfiguration } from '../../configuration'
import { getSelectorFromElement } from '../../getSelectorFromElement'

export interface FirstInput {
  delay: Duration
  time: RelativeTime
  targetSelector?: string
}

/**
 * Track the first input occurring during the initial View to return:
 * - First Input Delay
 * - First Input Time
 * Callback is called at most one time.
 * Documentation: https://web.dev/fid/
 * Reference implementation: https://github.com/GoogleChrome/web-vitals/blob/master/src/getFID.ts
 */
export function trackFirstInput(configuration: RumConfiguration, callback: (firstInput: FirstInput) => void) {
  onFID((fid) => {
    callback({
      delay: fid.value as Duration,
      time: fid.attribution.eventTime as RelativeTime,
      targetSelector:
        fid.attribution.eventEntry.target && isElementNode(fid.attribution.eventEntry.target)
          ? getSelectorFromElement(fid.attribution.eventEntry.target, configuration.actionNameAttribute)
          : undefined,
    })
  })

  return {
    stop: noop,
  }
}
