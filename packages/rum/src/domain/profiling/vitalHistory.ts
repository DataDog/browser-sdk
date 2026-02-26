import type { ClocksState, Duration, ValueHistoryEntry } from '@datadog/browser-core'
import { addDuration, createValueHistory, SESSION_TIME_OUT_DELAY } from '@datadog/browser-core'
import type { LifeCycle } from '@datadog/browser-rum-core'
import { LifeCycleEventType } from '@datadog/browser-rum-core'

export const VITAL_ID_HISTORY_TIME_OUT_DELAY = SESSION_TIME_OUT_DELAY

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

  const startedVitals = new Map<string, ValueHistoryEntry<VitalContext>>()

  lifeCycle.subscribe(LifeCycleEventType.VITAL_STARTED, (vitalStart) => {
    const startedVitalHistoryEntry = history.add(
      {
        id: vitalStart.id,
        startClocks: vitalStart.startClocks,
        duration: undefined,
        label: vitalStart.name,
      },
      vitalStart.startClocks.relative
    )

    startedVitals.set(vitalStart.id, startedVitalHistoryEntry)
  })

  lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, ({ rawRumEvent, startClocks, duration }) => {
    if (rawRumEvent.type === 'vital') {
      if (startedVitals.has(rawRumEvent.vital.id)) {
        const vitalHistoryEntry = startedVitals.get(rawRumEvent.vital.id)

        if (vitalHistoryEntry) {
          vitalHistoryEntry.value.duration = duration!
          vitalHistoryEntry.close(addDuration(startClocks.relative, duration!))
          startedVitals.delete(rawRumEvent.vital.id)
        }
      } else {
        history
          .add(
            {
              id: rawRumEvent.vital.id,
              startClocks,
              duration: duration!,
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
