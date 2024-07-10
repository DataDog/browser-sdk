import type { ClocksState, Duration, Context } from '@datadog/browser-core'
import { clocksNow, combine, elapsed, generateUUID, toServerDuration } from '@datadog/browser-core'
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

export interface DurationVitalInstance {
  stop: (options?: DurationVitalStop) => void
}

export interface DurationVital {
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

  function addDurationVital(vital: DurationVital) {
    if (isValid(vital)) {
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processVital(vital, true))
    }
  }

  return {
    addDurationVital,
    startDurationVital: (startVital: DurationVitalStart) =>
      createVitalInstance((vital) => {
        addDurationVital(vital)
      }, startVital),
  }
}

export function createVitalInstance(
  stopCallback: (vital: DurationVital) => void,
  vitalStart: DurationVitalStart
): DurationVitalInstance {
  const startClocks = clocksNow()
  let stopClocks: ClocksState | undefined

  return {
    stop: (vitalStop) => {
      if (stopClocks) {
        return
      }

      stopClocks = clocksNow()

      stopCallback(buildDurationVital(vitalStart, startClocks, vitalStop, stopClocks))
    },
  }
}

function buildDurationVital(
  vitalStart: DurationVitalStart,
  startClocks: ClocksState,
  vitalStop: DurationVitalStop = {},
  stopClocks: ClocksState
): DurationVital {
  return {
    name: vitalStart.name,
    type: VitalType.DURATION,
    startClocks,
    duration: elapsed(startClocks.timeStamp, stopClocks.timeStamp),
    context: combine(vitalStart.context, vitalStop.context),
    details: vitalStop.details ?? vitalStart.details,
  }
}

function processVital(vital: DurationVital, valueComputedBySdk: boolean): RawRumEventCollectedData<RawRumVitalEvent> {
  const rawRumEvent: RawRumVitalEvent = {
    date: vital.startClocks.timeStamp,
    vital: {
      id: generateUUID(),
      type: vital.type,
      name: vital.name,
      duration: toServerDuration(vital.duration),
      details: vital.details,
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
