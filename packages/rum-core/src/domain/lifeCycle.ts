import type { Context, PageExitEvent, RawError, RelativeTime } from '@datadog/browser-core'
import { AbstractLifeCycle } from '@datadog/browser-core'
import type { RumPerformanceEntry } from '../browser/performanceCollection'
import type { RumEventDomainContext } from '../domainContext.types'
import type { RawRumEvent } from '../rawRumEvent.types'
import type { RumEvent } from '../rumEvent.types'
import type { CommonContext } from './contexts/commonContext'
import type { RequestCompleteEvent, RequestStartEvent } from './requestCollection'
import type { AutoAction } from './rumEventsCollection/action/actionCollection'
import type { ViewEvent, ViewCreatedEvent, ViewEndedEvent } from './rumEventsCollection/view/trackViews'

export const enum LifeCycleEventType {
  PERFORMANCE_ENTRIES_COLLECTED,
  AUTO_ACTION_COMPLETED,
  VIEW_CREATED,
  VIEW_UPDATED,
  VIEW_ENDED,
  REQUEST_STARTED,
  REQUEST_COMPLETED,

  // The SESSION_EXPIRED lifecycle event has been introduced to represent when a session has expired
  // and trigger cleanup tasks related to this, prior to renewing the session. Its implementation is
  // slightly naive: it is not triggered as soon as the session is expired, but rather just before
  // notifying that the session is renewed. Thus, the session id is already set to the newly renewed
  // session.
  //
  // This implementation is "good enough" for our use-cases. Improving this is not trivial,
  // primarily because multiple instances of the SDK may be managing the same session cookie at
  // the same time, for example when using Logs and RUM on the same page, or opening multiple tabs
  // on the same domain.
  SESSION_EXPIRED,

  SESSION_RENEWED,
  PAGE_EXITED,
  RAW_RUM_EVENT_COLLECTED,
  RUM_EVENT_COLLECTED,
  RAW_ERROR_COLLECTED,
}

// Note: this interface needs to be exported even if it is not used outside of this module, else TS
// fails to build the rum-core package with error TS4058
export interface LifeCycleEventMap {
  [LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED]: RumPerformanceEntry[]
  [LifeCycleEventType.AUTO_ACTION_COMPLETED]: AutoAction
  [LifeCycleEventType.VIEW_CREATED]: ViewCreatedEvent
  [LifeCycleEventType.VIEW_UPDATED]: ViewEvent
  [LifeCycleEventType.VIEW_ENDED]: ViewEndedEvent
  [LifeCycleEventType.REQUEST_STARTED]: RequestStartEvent
  [LifeCycleEventType.REQUEST_COMPLETED]: RequestCompleteEvent
  [LifeCycleEventType.SESSION_EXPIRED]: void
  [LifeCycleEventType.SESSION_RENEWED]: void
  [LifeCycleEventType.PAGE_EXITED]: PageExitEvent
  [LifeCycleEventType.RAW_RUM_EVENT_COLLECTED]: RawRumEventCollectedData
  [LifeCycleEventType.RUM_EVENT_COLLECTED]: RumEvent & Context
  [LifeCycleEventType.RAW_ERROR_COLLECTED]: {
    error: RawError
    savedCommonContext?: CommonContext
    customerContext?: Context
  }
}

export interface RawRumEventCollectedData<E extends RawRumEvent = RawRumEvent> {
  startTime: RelativeTime
  savedCommonContext?: CommonContext
  customerContext?: Context
  rawRumEvent: E
  domainContext: RumEventDomainContext<E['type']>
}

export const LifeCycle = AbstractLifeCycle<LifeCycleEventMap>
export type LifeCycle = AbstractLifeCycle<LifeCycleEventMap>
