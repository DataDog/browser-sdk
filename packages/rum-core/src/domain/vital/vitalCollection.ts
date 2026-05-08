import type { ClocksState, Duration } from '@datadog/browser-core'
import {
  clocksNow,
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
import { startEventTracker } from '../eventTracker'

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
export interface DurationVitalOptions extends VitalOptions {
  /**
   * Vital key, used to identify a specific vital instance when multiple vitals with the same name
   * are tracked simultaneously
   */
  vitalKey?: string
}

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

export interface DurationVitalStart extends DurationVitalOptions {
  id: string
  name: string
  startClocks: ClocksState
  handlingStack?: string
}

interface BaseVital extends VitalOptions {
  name: string
  startClocks: ClocksState
  handlingStack?: string
}
export interface DurationVital extends BaseVital {
  id: string
  type: typeof VitalType.DURATION
  duration: Duration
}

export interface OperationStepVital extends BaseVital {
  type: typeof VitalType.OPERATION_STEP
  stepType: 'start' | 'end'
  operationKey?: string
  failureReason?: string
}

interface DurationVitalData {
  name: string
  context?: any
  description?: string
  handlingStack?: string
}

export function startVitalCollection(lifeCycle: LifeCycle, pageStateHistory: PageStateHistory) {
  const vitalTracker = startEventTracker<DurationVitalData>(lifeCycle)

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
    options?: FeatureOperationOptions & { handlingStack?: string },
    failureReason?: FailureReason
  ) {
    if (!isExperimentalFeatureEnabled(ExperimentalFeature.FEATURE_OPERATION_VITAL)) {
      return
    }

    const { operationKey, context, description, handlingStack } = options || {}

    const vital: OperationStepVital = {
      name,
      type: VitalType.OPERATION_STEP,
      operationKey,
      failureReason,
      stepType,
      startClocks: clocksNow(),
      context: sanitize(context),
      description,
      handlingStack,
    }
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processVital(vital))
  }

  function startDurationVital(
    name: string,
    options: DurationVitalOptions & { handlingStack?: string } = {},
    startClocks = clocksNow()
  ) {
    const { id } = vitalTracker.start(options.vitalKey ?? name, startClocks, {
      name,
      ...options,
    })
    lifeCycle.notify(LifeCycleEventType.VITAL_STARTED, { id, name, startClocks, ...options })
  }

  function stopDurationVital(name: string, options: DurationVitalOptions = {}, stopClocks = clocksNow()) {
    const stopped = vitalTracker.stop(options.vitalKey ?? name, stopClocks, options)
    if (stopped) {
      addDurationVital({
        type: VitalType.DURATION,
        ...stopped,
      })
    }
  }

  return {
    addOperationStepVital,
    addDurationVital,
    startDurationVital,
    stopDurationVital,
  }
}

function processVital(vital: DurationVital | OperationStepVital): RawRumEventCollectedData<RawRumVitalEvent> {
  const { startClocks, type, name, description, context, handlingStack } = vital
  const vitalId = vital.type === VitalType.DURATION ? vital.id : undefined

  const vitalData = {
    id: vitalId ?? generateUUID(),
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
    startClocks,
    duration: type === VitalType.DURATION ? vital.duration : undefined,
    domainContext: handlingStack ? { handlingStack } : {},
  }
}
