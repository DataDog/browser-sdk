import type { ClocksState, Duration, Context } from '@datadog/browser-core'
import { clocksNow, combine, elapsed, generateUUID, noop, toServerDuration } from '@datadog/browser-core'
import type { LifeCycle, RawRumEventCollectedData } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import type { RawRumVitalEvent } from '../../rawRumEvent.types'
import { RumEventType, VitalType } from '../../rawRumEvent.types'
import type { PageStateHistory } from '../contexts/pageStateHistory'
import { PageState } from '../contexts/pageStateHistory'

export interface DurationVitalOptions {
  context?: Context
  description?: string
}

export interface DurationVitalReference {
  __dd_vital_reference: true
  stop: () => void
}

export interface DurationVitalStart {
  name: string
  startClocks: ClocksState
  context?: Context
  description?: string
}

export interface DurationVital {
  name: string
  type: VitalType.DURATION
  startClocks: ClocksState
  duration: Duration
  description?: string
  context?: Context
}

export interface CustomVitalsState {
  vitalsByName: Map<string, DurationVitalStart>
  vitalsByReference: WeakMap<DurationVitalReference, DurationVitalStart>
}

export function createCustomVitalsState() {
  const vitalsByName = new Map<string, DurationVitalStart>()
  const vitalsByReference = new WeakMap<DurationVitalReference, DurationVitalStart>()
  return { vitalsByName, vitalsByReference }
}

export function startVitalCollection(
  lifeCycle: LifeCycle,
  pageStateHistory: PageStateHistory,
  customVitalsState: CustomVitalsState
) {
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
    startDurationVital: (name: string, options: DurationVitalOptions = {}) =>
      startDurationVital(customVitalsState, name, options),
    stopDurationVital: (nameOrRef: string | DurationVitalReference, options: DurationVitalOptions = {}) => {
      stopDurationVital(addDurationVital, customVitalsState, nameOrRef, options)
    },
  }
}

export function startDurationVital(
  { vitalsByName, vitalsByReference }: CustomVitalsState,
  name: string,
  options: DurationVitalOptions = {}
) {
  const vital = {
    name,
    startClocks: clocksNow(),
    context: options.context,
    description: options.description,
  }

  const reference: DurationVitalReference = { __dd_vital_reference: true, stop: noop }

  vitalsByName.set(name, vital)
  vitalsByReference.set(reference, vital)

  return reference
}

export function stopDurationVital(
  stopCallback: (vital: DurationVital) => void,
  { vitalsByName, vitalsByReference }: CustomVitalsState,
  nameOrRef: string | DurationVitalReference,
  options: DurationVitalOptions = {}
) {
  const vitalStart = typeof nameOrRef === 'string' ? vitalsByName.get(nameOrRef) : vitalsByReference.get(nameOrRef)

  if (!vitalStart) {
    return
  }

  stopCallback(buildDurationVital(vitalStart, vitalStart.startClocks, options, clocksNow()))

  if (typeof nameOrRef === 'string') {
    vitalsByName.delete(nameOrRef)
  } else {
    vitalsByReference.delete(nameOrRef)
  }
}

function buildDurationVital(
  vitalStart: DurationVitalStart,
  startClocks: ClocksState,
  stopOptions: DurationVitalOptions,
  stopClocks: ClocksState
): DurationVital {
  return {
    name: vitalStart.name,
    type: VitalType.DURATION,
    startClocks,
    duration: elapsed(startClocks.timeStamp, stopClocks.timeStamp),
    context: combine(vitalStart.context, stopOptions.context),
    description: stopOptions.description ?? vitalStart.description,
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
      description: vital.description,
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
