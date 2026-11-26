import type { ClocksState, Duration } from '@datadog/js-core/time'
import { addDuration, elapsed, relativeNow } from '@datadog/js-core/time'
import { createValueHistory, SESSION_TIME_OUT_DELAY } from '@datadog/browser-core'
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

  // Actions announced with ACTION_STARTED that will never produce a RUM event (e.g. the unused rage
  // click clone) would otherwise stay open forever: they would be attached to every following
  // profile and, being the oldest open entry, they would also prevent expired entries from being
  // cleaned up.
  lifeCycle.subscribe(LifeCycleEventType.ACTION_DISCARDED, ({ id }) => {
    history
      .findAllEntries()
      .find((entry) => entry.value.id === id)
      ?.remove()
  })

  // Trackers discard all their in-flight actions when the session is renewed: none of the actions
  // still open will produce a RUM event. Close them instead of removing them, so a profile that is
  // still being assembled for the previous session keeps them.
  lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    const now = relativeNow()
    history.findAllEntries().forEach((entry) => {
      entry.value.duration = elapsed(entry.startTime, now)
      entry.close(now)
    })
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
              // Instant actions (e.g. addAction) have no duration. Store 0 rather than undefined,
              // otherwise they would be read as actions still running when the profile is collected.
              duration: durationForEntry,
            },
            startClocks.relative
          )
          .close(addDuration(startClocks.relative, durationForEntry))
      }
    }
  })

  return history
}
