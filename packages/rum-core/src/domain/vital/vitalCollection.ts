import type { ClocksState, Duration, Context } from '@datadog/browser-core'
import { combine, elapsed, generateUUID } from '@datadog/browser-core'
import { LifeCycleEventType } from '../lifeCycle'
import type { LifeCycle, RawRumEventCollectedData } from '../lifeCycle'
import type { RawRumVitalEvent } from '../../rawRumEvent.types'
import { RumEventType, VitalType } from '../../rawRumEvent.types'

export interface DurationVitalStart {
  name: string
  startClocks: ClocksState
  context?: Context
}

export interface DurationVitalStop {
  name: string
  stopClocks: ClocksState
  context?: Context
}

interface DurationVital {
  name: string
  type: VitalType.DURATION
  startClocks: ClocksState
  value: Duration
  context?: Context
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
        context: combine(vitalStart.context, vitalStop.context),
      }
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processVital(vital))
      vitalStartsByName.delete(vitalStop.name)
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
    customerContext: vital.context,
    domainContext: {},
  }
}
