import type { ClocksState, Duration } from '@datadog/browser-core'
import {
  clocksNow,
  combine,
  elapsed,
  ExperimentalFeature,
  generateUUID,
  isExperimentalFeatureEnabled,
  sanitize,
  toServerDuration,
} from '@datadog/browser-core'
import type { LifeCycle, RawRumEventCollectedData } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import type { RawRumVitalEvent } from '../../rawRumEvent.types'
import { RumEventType, VitalType } from '../../rawRumEvent.types'
import type { PageStateHistory } from '../contexts/pageStateHistory'
import { PageState } from '../contexts/pageStateHistory'

/**
 * Vital options
 */
export interface VitalOptions {
  /**
   * Vital context
   */
  context?: any

  /**
   * Vital description
   */
  description?: string
}

/**
 * Duration vital options
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface DurationVitalOptions extends VitalOptions {}
export interface FeatureOperationOptions extends VitalOptions {
  operationKey?: string
}

export type FailureReason = 'error' | 'abandoned' | 'other'

/**
 * Add duration vital options
 */
export interface AddDurationVitalOptions extends DurationVitalOptions {
  /**
   * Vital start time, expects a UNIX timestamp in milliseconds (the number of milliseconds since January 1, 1970)
   */
  startTime: number

  /**
   * Vital duration, expects a duration in milliseconds
   */
  duration: number
}

export interface DurationVitalReference {
  __dd_vital_reference: true
}

export interface DurationVitalStart extends DurationVitalOptions {
  name: string
  startClocks: ClocksState
}

interface BaseVital extends VitalOptions {
  name: string
  startClocks: ClocksState
}
export interface DurationVital extends BaseVital {
  type: typeof VitalType.DURATION
  duration: Duration
}

export interface OperationStepVital extends BaseVital {
  type: typeof VitalType.OPERATION_STEP
  stepType: 'start' | 'end'
  operationKey?: string
  failureReason?: string
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
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processVital(vital))
    }
  }

  function addOperationStepVital(
    name: string,
    stepType: 'start' | 'end',
    options?: FeatureOperationOptions,
    failureReason?: FailureReason
  ) {
    if (!isExperimentalFeatureEnabled(ExperimentalFeature.FEATURE_OPERATION_VITAL)) {
      return
    }

    const { operationKey, context, description } = options || {}

    const vital: OperationStepVital = {
      name,
      type: VitalType.OPERATION_STEP,
      operationKey,
      failureReason,
      stepType,
      startClocks: clocksNow(),
      context: sanitize(context),
      description,
    }
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processVital(vital))
  }

  return {
    addOperationStepVital,
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
    ...options,
  }

  // To avoid leaking implementation details of the vital, we return a reference to it.
  const reference: DurationVitalReference = { __dd_vital_reference: true }

  vitalsByName.set(name, vital)

  // To avoid memory leaks caused by the creation of numerous references (e.g., from improper useEffect implementations), we use a WeakMap.
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

function processVital(vital: DurationVital | OperationStepVital): RawRumEventCollectedData<RawRumVitalEvent> {
  const { startClocks, type, name, description, context } = vital
  const vitalData = {
    id: generateUUID(),
    type,
    name,
    description,
    ...(type === VitalType.DURATION
      ? { duration: toServerDuration(vital.duration) }
      : {
          step_type: vital.stepType,
          operation_key: vital.operationKey,
          failure_reason: vital.failureReason,
        }),
  }

  return {
    rawRumEvent: {
      date: startClocks.timeStamp,
      vital: vitalData,
      type: RumEventType.VITAL,
      context,
    },
    startTime: startClocks.relative,
    duration: type === VitalType.DURATION ? vital.duration : undefined,
    domainContext: {},
  }
}
