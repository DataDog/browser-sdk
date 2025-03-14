import type { RawRumEvent } from '@datadog/browser-rum-core'
import { RumEventType } from '@datadog/browser-rum-core'

import { setLongTaskId } from './utils/longTaskRegistry'

/**
 * Store the Long Task ID in the registry for the Profiler to link it with the corresponding Profile.
 *
 * @param rawRumEvent The Raw RUM event
 * @param startTime The start time of the event (in this case the Long Task Performance Entry start time)
 */
export function mayStoreLongTaskIdForProfilerCorrelation({
  rawRumEvent,
  startTime,
}: {
  rawRumEvent: RawRumEvent
  startTime: number
}) {
  if (rawRumEvent.type !== RumEventType.LONG_TASK) {
    return
  }

  const longTaskId = rawRumEvent.long_task.id

  // Store longTaskId in the registry for the Profiler to link it with the corresponding Profile.
  setLongTaskId(longTaskId, startTime)
}
