import type { ClocksState, Duration, Context } from '@datadog/browser-core'
import { clocksNow, combine, elapsed, generateUUID } from '@datadog/browser-core'
import type { LifeCycle, RawRumEventCollectedData } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import type { RawRumVitalEvent } from '../../rawRumEvent.types'
import { RumEventType, VitalType } from '../../rawRumEvent.types'
import type { PageStateHistory } from '../contexts/pageStateHistory'
import { PageState } from '../contexts/pageStateHistory'

export interface DurationVitalStart {
  name: string
  context?: Context
  details?: string
}

export interface DurationVitalStop {
  context?: Context
  details?: string
}

export interface DurationVitalAdd {
  name: string
  startClocks: ClocksState
  duration: Duration
  context?: Context
  details?: string
}

export interface DurationVitalInstance {
  stop: (options?: DurationVitalStop) => void
}

interface DurationVital {
  name: string
  type: VitalType.DURATION
  startClocks: ClocksState
  duration: Duration
  details?: string
  context?: Context
}

export function startVitalCollection(lifeCycle: LifeCycle, pageStateHistory: PageStateHistory) {
  function isValid(vital: DurationVital) {
    return !pageStateHistory.wasInPageStateDuringPeriod(PageState.FROZEN, vital.startClocks.relative, vital.duration)
  }

  return {
    startDurationVital: (vitalStart: DurationVitalStart): DurationVitalInstance => {
      const startClocks = clocksNow()
      let stopClocks: ClocksState | undefined

      return {
        stop: (vitalStop) => {
          if (stopClocks) {
            return
          }

          stopClocks = clocksNow()

          const vital = buildDurationVital(vitalStart, startClocks, vitalStop, stopClocks)
          if (isValid(vital)) {
            lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processVital(vital, true))
          }
        },
      }
    },
    addDurationVital: (vitalAdd: DurationVitalAdd) => {
      const vital = Object.assign({ type: VitalType.DURATION }, vitalAdd)

      if (isValid(vital)) {
        lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processVital(vital, true))
      }
    },
  }
}

function buildDurationVital(
  vitalStart: DurationVitalStart,
  startClocks: ClocksState,
  stopOptions: DurationVitalStop = {},
  stopClocks: ClocksState
) {
  return {
    name: vitalStart.name,
    type: VitalType.DURATION,
    startClocks,
    duration: elapsed(startClocks.timeStamp, stopClocks.timeStamp),
    context: combine(vitalStart.context, stopOptions.context),
    details: vitalStart.details ?? stopOptions.details,
  }
}

function processVital(vital: DurationVital, valueComputedBySdk: boolean): RawRumEventCollectedData<RawRumVitalEvent> {
  const rawRumEvent: RawRumVitalEvent = {
    date: vital.startClocks.timeStamp,
    vital: {
      id: generateUUID(),
      type: vital.type,
      name: vital.name,
      duration: vital.duration,
      details: vital.details,
      custom: {},
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
