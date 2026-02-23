import type { ClocksState, Duration } from '@datadog/browser-core'
import { addDuration, createValueHistory, SESSION_TIME_OUT_DELAY } from '@datadog/browser-core'
import type { LifeCycle } from '@datadog/browser-rum-core'
import { RumPerformanceEntryType, LifeCycleEventType, RumLongTaskEntryType } from '@datadog/browser-rum-core'

export const LONG_TASK_ID_HISTORY_EXPIRE_DELAY = SESSION_TIME_OUT_DELAY

export interface LongTaskContext {
  id: string
  startClocks: ClocksState
  duration: Duration
  entryType: RumPerformanceEntryType.LONG_ANIMATION_FRAME | RumPerformanceEntryType.LONG_TASK
}

export function createLongTaskHistory(lifeCycle: LifeCycle) {
  const history = createValueHistory<LongTaskContext>({
    expireDelay: LONG_TASK_ID_HISTORY_EXPIRE_DELAY,
  })

  lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, ({ rawRumEvent, startClocks, duration }) => {
    if (rawRumEvent.type === 'long_task') {
      history
        .add(
          {
            id: rawRumEvent.long_task.id,
            startClocks,
            duration: duration!,
            entryType:
              rawRumEvent.long_task.entry_type === RumLongTaskEntryType.LONG_TASK
                ? RumPerformanceEntryType.LONG_TASK
                : RumPerformanceEntryType.LONG_ANIMATION_FRAME,
          },
          startClocks.relative
        )
        .close(addDuration(startClocks.relative, duration!))
    }
  })

  return history
}
