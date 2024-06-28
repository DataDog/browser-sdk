import { ONE_MINUTE } from '@datadog/browser-core'
import type { Duration } from '@datadog/browser-core'
// eslint-disable-next-line local-rules/disallow-side-effects
import { onINP } from 'web-vitals/attribution'
import { isElementNode } from '../../../browser/htmlDomUtils'
import { RumPerformanceEntryType, supportPerformanceTimingEvent } from '../../../browser/performanceCollection'
import type { RumConfiguration } from '../../configuration'
import { getSelectorFromElement } from '../../getSelectorFromElement'

// Arbitrary value to cap INP outliers
export const MAX_INP_VALUE = (1 * ONE_MINUTE) as Duration

export interface InteractionToNextPaint {
  value: Duration
  targetSelector?: string
  time?: Duration
}
/**
 * Track the interaction to next paint (INP).
 * To avoid outliers, return the p98 worst interaction of the view.
 * Documentation: https://web.dev/inp/
 * Reference implementation: https://github.com/GoogleChrome/web-vitals/blob/main/src/onINP.ts
 */
export function trackInteractionToNextPaint(configuration: RumConfiguration) {
  let interactionToNextPaint = -1 as Duration
  let interactionToNextPaintTargetSelector: string | undefined
  let interactionToNextPaintTime = -1 as Duration
  onINP(
    (inp) => {
      const { interactionTargetElement, interactionTime } = inp.attribution
      interactionToNextPaint = inp.value as Duration
      interactionToNextPaintTime = interactionTime as Duration
      if (interactionTargetElement && isElementNode(interactionTargetElement)) {
        interactionToNextPaintTargetSelector = getSelectorFromElement(
          interactionTargetElement,
          configuration.actionNameAttribute
        )
      }
    },
    {
      reportAllChanges: true,
    }
  )

  return {
    getInteractionToNextPaint: (): InteractionToNextPaint | undefined => {
      // If no INP duration where captured because of the performanceObserver 40ms threshold
      // but the view interaction count > 0 then report 0
      if (interactionToNextPaint >= 0) {
        return {
          value: Math.min(interactionToNextPaint, MAX_INP_VALUE) as Duration,
          targetSelector: interactionToNextPaintTargetSelector,
          time: interactionToNextPaintTime,
        }
      }
      return {
        value: 0 as Duration,
      }
    },
    setViewEnd: () => {
      // viewEnd = viewEndTime
      // stopViewInteractionCount()
    },
    stop,
  }
}

export function isInteractionToNextPaintSupported() {
  return (
    supportPerformanceTimingEvent(RumPerformanceEntryType.EVENT) &&
    window.PerformanceEventTiming &&
    'interactionId' in PerformanceEventTiming.prototype
  )
}
