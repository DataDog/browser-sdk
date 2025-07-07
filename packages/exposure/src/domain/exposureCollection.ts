import type { Context, TimeStamp } from '@datadog/browser-core'
import { timeStampNow, createHandlingStack } from '@datadog/browser-core'
import type { LifeCycle } from './lifeCycle'
import { LifeCycleEventType } from './lifeCycle'
import type { RawExposureEvent } from '../rawExposureEvent.types'
import type { ExposureEventDomainContext } from '../domainContext.types'

export interface TrackExposureOptions {
  flagDefaultValue?: any
  evaluationContext?: Record<string, any>
  targetingKey?: string
  reason?: string
  ruleId?: string
  context?: Context
}

export function startExposureCollection(lifeCycle: LifeCycle) {
  function trackExposure(
    flagKey: string,
    flagValue: any,
    options: TrackExposureOptions = {}
  ) {
    const handlingStack = createHandlingStack('log')
    
    const rawExposureEvent: RawExposureEvent = {
      date: timeStampNow(),
      exposure: {
        flag_key: flagKey,
        flag_value: flagValue,
        flag_default_value: options.flagDefaultValue,
        evaluation_context: options.evaluationContext,
        targeting_key: options.targetingKey,
        reason: options.reason,
        rule_id: options.ruleId,
      },
    }

    const domainContext: ExposureEventDomainContext = {
      handlingStack,
    }

    lifeCycle.notify(LifeCycleEventType.RAW_EXPOSURE_COLLECTED, {
      rawExposureEvent,
      messageContext: options.context,
      domainContext,
    })
  }

  return {
    trackExposure,
  }
} 