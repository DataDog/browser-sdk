import type { ClocksState, Duration } from '@datadog/browser-core'
import { addDuration, createValueHistory, SESSION_TIME_OUT_DELAY } from '@datadog/browser-core'
import type { LifeCycle } from '@datadog/browser-rum-core'
import { LifeCycleEventType } from '@datadog/browser-rum-core'

const ACTION_ID_HISTORY_TIME_OUT_DELAY = SESSION_TIME_OUT_DELAY

export interface ActionContext {
  id: string
  label: string
  duration?: Duration
  startClocks: ClocksState
}

export function createActionHistory(lifeCycle: LifeCycle) {
  const history = createValueHistory<ActionContext>({
    expireDelay: ACTION_ID_HISTORY_TIME_OUT_DELAY,
  })

  lifeCycle.subscribe(LifeCycleEventType.ACTION_STARTED, (actionStart) => {
    history.add(
      {
        id: actionStart.id,
        // The label is temporarily empty since we need to account for customers that might
        // redact the action name in the beforeSend callback. We will either try to do patch this
        // behavior, or remove the label field entirely.
        label: '',
        startClocks: actionStart.startClocks,
        duration: undefined,
      },
      actionStart.startClocks.relative
    )
  })

  lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, ({ rawRumEvent, startClocks, duration }) => {
    if (rawRumEvent.type === 'action') {
      const historyEntry = history
        .getEntries(startClocks.relative)
        .find((entry) => entry.value.id === rawRumEvent.action.id)
      const durationForEntry = duration ?? (0 as Duration)

      if (historyEntry) {
        historyEntry.value.duration = durationForEntry
        historyEntry.close(addDuration(startClocks.relative, durationForEntry))
      } else {
        history
          .add(
            {
              id: rawRumEvent.action.id,
              // The label is temporarily empty since we need to account for customers that might
              // redact the action name in the beforeSend callback. We will either try to do patch this
              // behavior, or remove the label field entirely.
              label: '',
              startClocks,
              duration,
            },
            startClocks.relative
          )
          .close(addDuration(startClocks.relative, durationForEntry))
      }
    }
  })

  return history
}
