import { addDuration, createValueHistory, SESSION_TIME_OUT_DELAY } from '@datadog/browser-core'
import { LifeCycleEventType } from '@datadog/browser-rum-core'
import type { LifeCycle } from '@datadog/browser-rum-core'

export const LONG_TASK_ID_HISTORY_EXPIRE_DELAY = SESSION_TIME_OUT_DELAY

export function createLongTaskIdHistory(lifeCycle: LifeCycle) {
  const history = createValueHistory<string>({
    expireDelay: LONG_TASK_ID_HISTORY_EXPIRE_DELAY,
  })

  lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, ({ rawRumEvent, startTime, duration }) => {
    if (rawRumEvent.type === 'long_task') {
      history.add(rawRumEvent.long_task.id, startTime).close(addDuration(startTime, duration!))
    }
  })

  return history
}
