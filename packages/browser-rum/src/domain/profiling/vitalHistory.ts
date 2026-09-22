import type { ClocksState, Duration } from '@datadog/js-core/time'
import { elapsed, addDuration } from '@datadog/js-core/time'
import { createValueHistory, SESSION_TIME_OUT_DELAY } from '@datadog/browser-core'
import type { LifeCycle } from '@datadog/browser-rum-core'
import { LifeCycleEventType, VitalType } from '@datadog/browser-rum-core'

export const VITAL_ID_HISTORY_TIME_OUT_DELAY = SESSION_TIME_OUT_DELAY

export interface VitalContext {
  id: string
  type: VitalType
  label: string
  operationKey?: string
  duration?: Duration
  startClocks: ClocksState
}

export function createVitalHistory(lifeCycle: LifeCycle) {
  const history = createValueHistory<VitalContext>({
    expireDelay: VITAL_ID_HISTORY_TIME_OUT_DELAY,
  })

  lifeCycle.subscribe(LifeCycleEventType.DURATION_VITAL_STARTED, (vitalStart) => {
    history.add(
      {
        id: vitalStart.id,
        type: VitalType.DURATION,
        startClocks: vitalStart.startClocks,
        duration: undefined,
        label: vitalStart.name,
      },
      vitalStart.startClocks.relative
    )
  })

  lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, ({ rawRumEvent, startClocks, duration }) => {
    if (rawRumEvent.type !== 'vital') {
      return
    }

    // WebSocket vitals report a phase of a connection rather than something a profile can be
    // attributed to: they are instant, and they carry no vital duration to close an entry with.
    if (rawRumEvent.vital.type === VitalType.WEBSOCKET) {
      return
    }

    // held in a variable rather than read from the event each time, so that the narrowing above
    // survives into the callbacks below
    const vital = rawRumEvent.vital

    // For operation step vitals, we only tag profiles with the start step's id.
    // This means that if we receive an end step vital, we need to look for the
    // corresponding start one and update its duration. If we receive a start step vital
    // however, we just store it and wait for the end step.
    if (vital.type === VitalType.OPERATION_STEP) {
      if (vital.step_type === 'start') {
        history.add(
          {
            id: vital.id,
            type: vital.type,
            operationKey: vital.operation_key,
            startClocks,
            label: vital.name,
          },
          startClocks.relative
        )
      } else if (vital.step_type === 'end') {
        const historyEntry = history
          .findAllEntries()
          .find(
            (entry) =>
              entry.value.type === VitalType.OPERATION_STEP &&
              entry.value.label === vital.name &&
              entry.value.operationKey === vital.operation_key
          )

        if (!historyEntry) {
          return
        }

        historyEntry.value.duration = elapsed(historyEntry.value.startClocks.relative, startClocks.relative)
        historyEntry.close(startClocks.relative)
      }

      return
    }

    // All the other vital types are handled normally (i.e. stored in the
    // history and tagged on the profiles)
    const historyEntry = history.getEntries(startClocks.relative).find((entry) => entry.value.id === vital.id)

    if (historyEntry) {
      historyEntry.value.duration = duration!
      historyEntry.close(addDuration(startClocks.relative, duration!))
      return
    }

    history
      .add(
        {
          id: vital.id,
          type: vital.type,
          operationKey: vital.operation_key,
          startClocks,
          duration,
          label: vital.name,
        },
        startClocks.relative
      )
      .close(addDuration(startClocks.relative, duration!))
  })

  return history
}
