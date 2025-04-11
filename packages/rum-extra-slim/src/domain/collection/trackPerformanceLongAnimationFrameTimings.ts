import {
  createPerformanceObservable,
  RumPerformanceEntryType,
} from '@datadog/browser-rum-core/src/browser/performanceObservable'
import type { TransportManager } from '../transportManager'
import { EVENT } from '../event'
import type { PerformanceLongAnimationFrameTimingEvent } from '../event'

export function trackPerformanceLongAnimationFrameTimings(transportManager: TransportManager): () => void {
  const observable = createPerformanceObservable({} as any, {
    type: RumPerformanceEntryType.LONG_ANIMATION_FRAME,
    buffered: true,
  })

  const subscription = observable.subscribe((entries) => {
    for (const entry of entries) {
      const data: PerformanceLongAnimationFrameTimingEvent = {
        type: EVENT.LONG_ANIMATION_FRAME_TIMING,
        entry: entry.toJSON(),
      }

      transportManager.send(data)
    }
  })

  return () => subscription.unsubscribe()
}
