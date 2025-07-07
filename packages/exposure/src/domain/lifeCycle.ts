import { AbstractLifeCycle } from '@datadog/browser-core'
import type { Context } from '@datadog/browser-core'
import type { ExposureEvent } from '../exposureEvent.types'
import type { RawExposureEvent } from '../rawExposureEvent.types'
import type { ExposureEventDomainContext } from '../domainContext.types'

export const enum LifeCycleEventType {
  RAW_EXPOSURE_COLLECTED,
  EXPOSURE_COLLECTED,
}

interface LifeCycleEventMap {
  [LifeCycleEventType.RAW_EXPOSURE_COLLECTED]: RawExposureCollectedEvent
  [LifeCycleEventType.EXPOSURE_COLLECTED]: ExposureEvent & Context
}

export const LifeCycle = AbstractLifeCycle<LifeCycleEventMap>
export type LifeCycle = AbstractLifeCycle<LifeCycleEventMap>

export interface RawExposureCollectedEvent {
  rawExposureEvent: RawExposureEvent
  messageContext?: Partial<ExposureEvent>
  savedCommonContext?: any
  domainContext?: ExposureEventDomainContext
} 