import type { ClocksState, Duration, Context } from '@datadog/browser-core'
import { combine, elapsed, generateUUID } from '@datadog/browser-core'
import type { LifeCycle, RawRumEventCollectedData } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import type { RawRumVitalEvent } from '../../rawRumEvent.types'
import { RumEventType, VitalType } from '../../rawRumEvent.types'
import type { PageStateHistory } from '../contexts/pageStateHistory'
import { PageState } from '../contexts/pageStateHistory'

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

export function startVitalCollection(lifeCycle: LifeCycle, pageStateHistory: PageStateHistory) {
  const vitalStartsByName = new Map<string, DurationVitalStart>()

  lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    // Discard all the vitals that have not been stopped to avoid memory leaks
    vitalStartsByName.clear()
  })

  function isValid(vital: DurationVital) {
    return !pageStateHistory.wasInPageStateDuringPeriod(PageState.FROZEN, vital.startClocks.relative, vital.value)
  }

  return {
    startDurationVital: (vitalStart: DurationVitalStart) => {
      vitalStartsByName.set(vitalStart.name, vitalStart)
    },
    stopDurationVital: (vitalStop: DurationVitalStop) => {
      const vitalStart = vitalStartsByName.get(vitalStop.name)
      if (!vitalStart) {
        return
      }
      const vital = buildDurationVital(vitalStart, vitalStop)
      vitalStartsByName.delete(vital.name)
      if (isValid(vital)) {
        lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processVital(vital, true))
      }
    },
  }
}

function buildDurationVital(vitalStart: DurationVitalStart, vitalStop: DurationVitalStop) {
  return {
    name: vitalStart.name,
    type: VitalType.DURATION,
    startClocks: vitalStart.startClocks,
    value: elapsed(vitalStart.startClocks.timeStamp, vitalStop.stopClocks.timeStamp),
    context: combine(vitalStart.context, vitalStop.context),
  }
}

function processVital(vital: DurationVital, valueComputedBySdk: boolean): RawRumEventCollectedData<RawRumVitalEvent> {
  const rawRumEvent: RawRumVitalEvent = {
    date: vital.startClocks.timeStamp,
    vital: {
      id: generateUUID(),
      type: vital.type,
      name: vital.name,
      custom: {
        [vital.name]: vital.value,
      },
    },
    type: RumEventType.VITAL,
  }

  if (valueComputedBySdk) {
    rawRumEvent._dd = {
      vital: {
        computed_value: true,
      },
    }
  }

  return {
    rawRumEvent,
    startTime: vital.startClocks.relative,
    customerContext: vital.context,
    domainContext: {},
  }
}
