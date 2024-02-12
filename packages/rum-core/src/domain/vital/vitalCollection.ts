import type { ClocksState, Duration } from '@datadog/browser-core'
import { elapsed, generateUUID } from '@datadog/browser-core'
import { LifeCycleEventType } from '../lifeCycle'
import type { LifeCycle, RawRumEventCollectedData } from '../lifeCycle'
import type { RawRumVitalEvent } from '../../rawRumEvent.types'
import { RumEventType, VitalType } from '../../rawRumEvent.types'

export interface DurationVitalStart {
  name: string
  startClocks: ClocksState
}

export interface DurationVitalStop {
  name: string
  stopClocks: ClocksState
}

interface DurationVital {
  name: string
  type: VitalType.DURATION
  startClocks: ClocksState
  value: Duration
}

export function startVitalCollection(lifeCycle: LifeCycle) {
  const vitalStartsByName = new Map<string, DurationVitalStart>()
  return {
    startDurationVital: (vitalStart: DurationVitalStart) => {
      vitalStartsByName.set(vitalStart.name, vitalStart)
    },
    stopDurationVital: (vitalStop: DurationVitalStop) => {
      const vitalStart = vitalStartsByName.get(vitalStop.name)
      if (!vitalStart) {
        return
      }
      const vital = {
        name: vitalStart.name,
        type: VitalType.DURATION,
        startClocks: vitalStart.startClocks,
        value: elapsed(vitalStart.startClocks.timeStamp, vitalStop.stopClocks.timeStamp),
      }
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processVital(vital))
    },
  }
}

function processVital(vital: DurationVital): RawRumEventCollectedData<RawRumVitalEvent> {
  return {
    rawRumEvent: {
      date: vital.startClocks.timeStamp,
      vital: {
        id: generateUUID(),
        type: vital.type,
        custom: {
          [vital.name]: vital.value,
        },
      },
      type: RumEventType.VITAL,
    },
    startTime: vital.startClocks.relative,
    domainContext: {},
  }
}
