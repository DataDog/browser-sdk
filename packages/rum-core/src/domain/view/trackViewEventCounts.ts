import type { LifeCycle } from '../lifeCycle'
import { trackEventCounts } from '../trackEventCounts'

export function trackViewEventCounts(lifeCycle: LifeCycle, viewId: string, onChange: () => void) {
  const { stop, eventCounts } = trackEventCounts({
    lifeCycle,
    isChildEvent: (event) => event.view.id === viewId,
    onChange,
  })

  return {
    stop,
    eventCounts,
  }
}
