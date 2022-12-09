import { ONE_MINUTE } from '@datadog/browser-core'
import type { LifeCycle } from '../../lifeCycle'
import { trackEventCounts } from '../../trackEventCounts'

// Arbitrary delay for stopping event counting after the view ends. Ideally, we would not stop and
// keep counting events until the end of the session. But this might have a small performance impact
// if there are many many views: we would need to go through each event to see if the related view
// matches. So let's have a fairly short delay to avoid impacting performances too much.
//
// In the future, we could have views stored in a data structure similar to ContextHistory. Whenever
// a child event is collected, we could look into this history to find the matching view and
// increase the associated and increase its counter. Having a centralized data structure for it
// would allow us to look for views more efficiently.
//
// For now, having a small cleanup delay will already improve the situation in most cases.

export const KEEP_TRACKING_EVENT_COUNTS_AFTER_VIEW_DELAY = 5 * ONE_MINUTE

export function trackViewEventCounts(lifeCycle: LifeCycle, viewId: string, onChange: () => void) {
  const { stop, eventCounts } = trackEventCounts({
    lifeCycle,
    isChildEvent: (event) => event.view.id === viewId,
    onChange,
  })

  return {
    scheduleStop: () => {
      setTimeout(stop, KEEP_TRACKING_EVENT_COUNTS_AFTER_VIEW_DELAY)
    },
    eventCounts,
  }
}
