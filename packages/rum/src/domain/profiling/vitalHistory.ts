import type { ClocksState, Duration } from '@datadog/browser-core'
import { addDuration, createValueHistory, SESSION_TIME_OUT_DELAY } from '@datadog/browser-core'
import type { LifeCycle } from '@datadog/browser-rum-core'
import { LifeCycleEventType } from '@datadog/browser-rum-core'

const VITAL_ID_HISTORY_TIME_OUT_DELAY = SESSION_TIME_OUT_DELAY

export interface VitalContext {
  id: string
  label: string
  duration?: Duration
  startClocks: ClocksState
}

export function createVitalHistory(lifeCycle: LifeCycle) {
  const history = createValueHistory<VitalContext>({
    expireDelay: VITAL_ID_HISTORY_TIME_OUT_DELAY,
  })

  lifeCycle.subscribe(LifeCycleEventType.VITAL_STARTED, (vitalStart) => {
    history.add(
      {
        id: vitalStart.id,
        startClocks: vitalStart.startClocks,
        duration: undefined,
        label: vitalStart.name,
      },
      vitalStart.startClocks.relative
    )
  })

  lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, ({ rawRumEvent, startClocks, duration }) => {
    if (rawRumEvent.type === 'vital') {
      const historyEntry = history
        .getEntries(startClocks.relative)
        .find((entry) => entry.value.id === rawRumEvent.vital.id)

      if (historyEntry) {
        historyEntry.value.duration = duration!
        historyEntry.close(addDuration(startClocks.relative, duration!))
      } else {
        history
          .add(
            {
              id: rawRumEvent.vital.id,
              startClocks,
              duration,
              label: rawRumEvent.vital.name,
            },
            startClocks.relative
          )
          .close(addDuration(startClocks.relative, duration!))
      }
    }
  })

  return history
}
