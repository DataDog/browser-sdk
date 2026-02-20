import type { ClocksState, Duration, ValueHistoryEntry } from '@datadog/browser-core'
import { addDuration, createValueHistory, SESSION_TIME_OUT_DELAY } from '@datadog/browser-core'
import type { LifeCycle } from '@datadog/browser-rum-core'
import { LifeCycleEventType } from '@datadog/browser-rum-core'

export const ACTION_ID_HISTORY_TIME_OUT_DELAY = SESSION_TIME_OUT_DELAY

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

  const startedActions = new Map<string, ValueHistoryEntry<ActionContext>>()

  lifeCycle.subscribe(LifeCycleEventType.ACTION_STARTED, (actionStart) => {
    const startedActionHistoryEntry = history.add(
      {
        id: actionStart.id,
        label: '',
        startClocks: actionStart.startClocks,
        duration: undefined,
      },
      actionStart.startClocks.relative
    )

    startedActions.set(actionStart.id, startedActionHistoryEntry)
  })

  lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, ({ rawRumEvent, startClocks, duration }) => {
    if (rawRumEvent.type === 'action') {
      if (startedActions.has(rawRumEvent.action.id)) {
        const actionHistoryEntry = startedActions.get(rawRumEvent.action.id)

        if (actionHistoryEntry) {
          actionHistoryEntry.value.duration = duration!
          actionHistoryEntry.close(addDuration(startClocks.relative, duration!))
          startedActions.delete(rawRumEvent.action.id)
        }
      } else {
        history
          .add(
            {
              id: rawRumEvent.action.id,
              label: '',
              startClocks,
              duration: duration!,
            },
            startClocks.relative
          )
          .close(addDuration(startClocks.relative, duration!))
      }
    }
  })

  return history
}
