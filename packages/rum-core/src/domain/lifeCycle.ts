import type { Context, PageExitEvent, RawError, RelativeTime } from '@datadog/browser-core'
import { AbstractLifeCycle } from '@datadog/browser-core'
import type { RumPerformanceEntry } from '../browser/performanceCollection'
import type { RumEventDomainContext } from '../domainContext.types'
import type { RawRumEvent } from '../rawRumEvent.types'
import type { RumEvent } from '../rumEvent.types'
import type { CommonContext } from './contexts/commonContext'
import type { RequestCompleteEvent, RequestStartEvent } from './requestCollection'
import type { AutoAction } from './action/actionCollection'
import type { ViewEvent, ViewCreatedEvent, ViewEndedEvent } from './view/trackViews'

export const enum LifeCycleEventType {
  // Contexts (like viewContexts) should be opened using prefixed BEFORE_XXX events and closed using prefixed AFTER_XXX events
  // It ensures the context is available during the non prefixed event callbacks
  PERFORMANCE_ENTRIES_COLLECTED,
  AUTO_ACTION_COMPLETED,
  BEFORE_VIEW_CREATED,
  VIEW_CREATED,
  VIEW_UPDATED,
  VIEW_ENDED,
  AFTER_VIEW_ENDED,
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

// This is a workaround for an issue occurring when the Browser SDK is included in a TypeScript
// project configured with `isolatedModules: true`. Even if the const enum is declared in this
// module, we cannot use it directly to define the EventMap interface keys (TS error: "Cannot access
// ambient const enums when the '--isolatedModules' flag is provided.").
//
// Using a plain enum would fix the issue, but would also add 2KB to the minified bundle. By using
// this workaround, we can keep using a const enum without impacting the bundle size (since it is a
// "declare" statement, it will only be used during typecheck and completely ignored when building
// JavaScript).
//
// See issues:
// * https://github.com/DataDog/browser-sdk/issues/2208
// * https://github.com/microsoft/TypeScript/issues/54152
declare const LifeCycleEventTypeAsConst: {
  PERFORMANCE_ENTRIES_COLLECTED: LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED
  AUTO_ACTION_COMPLETED: LifeCycleEventType.AUTO_ACTION_COMPLETED
  BEFORE_VIEW_CREATED: LifeCycleEventType.BEFORE_VIEW_CREATED
  VIEW_CREATED: LifeCycleEventType.VIEW_CREATED
  VIEW_UPDATED: LifeCycleEventType.VIEW_UPDATED
  VIEW_ENDED: LifeCycleEventType.VIEW_ENDED
  AFTER_VIEW_ENDED: LifeCycleEventType.AFTER_VIEW_ENDED
  REQUEST_STARTED: LifeCycleEventType.REQUEST_STARTED
  REQUEST_COMPLETED: LifeCycleEventType.REQUEST_COMPLETED
  SESSION_EXPIRED: LifeCycleEventType.SESSION_EXPIRED
  SESSION_RENEWED: LifeCycleEventType.SESSION_RENEWED
  PAGE_EXITED: LifeCycleEventType.PAGE_EXITED
  RAW_RUM_EVENT_COLLECTED: LifeCycleEventType.RAW_RUM_EVENT_COLLECTED
  RUM_EVENT_COLLECTED: LifeCycleEventType.RUM_EVENT_COLLECTED
  RAW_ERROR_COLLECTED: LifeCycleEventType.RAW_ERROR_COLLECTED
}

// Note: this interface needs to be exported even if it is not used outside of this module, else TS
// fails to build the rum-core package with error TS4058
export interface LifeCycleEventMap {
  [LifeCycleEventTypeAsConst.PERFORMANCE_ENTRIES_COLLECTED]: RumPerformanceEntry[]
  [LifeCycleEventTypeAsConst.AUTO_ACTION_COMPLETED]: AutoAction
  [LifeCycleEventTypeAsConst.BEFORE_VIEW_CREATED]: ViewCreatedEvent
  [LifeCycleEventTypeAsConst.VIEW_CREATED]: ViewCreatedEvent
  [LifeCycleEventTypeAsConst.VIEW_UPDATED]: ViewEvent
  [LifeCycleEventTypeAsConst.VIEW_ENDED]: ViewEndedEvent
  [LifeCycleEventTypeAsConst.AFTER_VIEW_ENDED]: ViewEndedEvent
  [LifeCycleEventTypeAsConst.REQUEST_STARTED]: RequestStartEvent
  [LifeCycleEventTypeAsConst.REQUEST_COMPLETED]: RequestCompleteEvent
  [LifeCycleEventTypeAsConst.SESSION_EXPIRED]: void
  [LifeCycleEventTypeAsConst.SESSION_RENEWED]: void
  [LifeCycleEventTypeAsConst.PAGE_EXITED]: PageExitEvent
  [LifeCycleEventTypeAsConst.RAW_RUM_EVENT_COLLECTED]: RawRumEventCollectedData
  [LifeCycleEventTypeAsConst.RUM_EVENT_COLLECTED]: RumEvent & Context
  [LifeCycleEventTypeAsConst.RAW_ERROR_COLLECTED]: {
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
