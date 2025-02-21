import type { Context, PageExitEvent, RawError, RelativeTime } from '@datadog/browser-core'
import { AbstractLifeCycle } from '@datadog/browser-core'
import type { RumEventDomainContext } from '../domainContext.types'
import type { RawRumEvent } from '../rawRumEvent.types'
import type { RumEvent } from '../rumEvent.types'
import type { CommonContext } from './contexts/commonContext'
import type { RequestCompleteEvent, RequestStartEvent } from './requestCollection'
import type { AutoAction } from './action/actionCollection'
import type {
  ViewEvent,
  ViewCreatedEvent,
  ViewDestroyedEvent,
  ViewEndedEvent,
  BeforeViewUpdateEvent,
} from './view/trackViews'

export const enum LifeCycleEventType {
  // Some LifeCycle events have BEFORE_ or AFTER_ variants. When these variants exist,
  // they are dispatched in sequence, in the following order:
  //  - BEFORE_EVENT
  //  - EVENT
  //  - AFTER_EVENT
  // The convention is that global contextual data structures should be created in BEFORE_
  // handlers and destroyed in AFTER_ handlers. This ensures that these contexts are
  // available to all handlers for the non-prefixed version of the event. Events typically
  // only have these variants if there are existing handlers that require them; if you're
  // adding a new handler of this kind, you may need to add a new prefixed variant of an
  // existing event as well.

  AUTO_ACTION_COMPLETED,

  /** We are preparing to transition to a new view. */
  BEFORE_VIEW_CREATED,

  /** We have transitioned to a new view. All BEFORE_VIEW_CREATED handlers have run. */
  VIEW_CREATED,

  /**
   * Something about the current view (e.g. its context) has changed, so we're preparing
   * to generate a new view update to send to the intake.
   */
  BEFORE_VIEW_UPDATED,

  /**
   * We've generated a new view update to send to the intake. All BEFORE_VIEW_UPDATED
   * handlers have run.
   */
  VIEW_UPDATED,

  /**
   * The view is conceptually over, but we're still continuing to track trailing events;
   * we do this for a period of time controlled by KEEP_TRACKING_AFTER_VIEW_DELAY.
   * (Note that this means that BEFORE_VIEW_UPDATED and VIEW_UPDATED can be delivered
   * *after* VIEW_ENDED and AFTER_VIEW_ENDED.)
   */
  VIEW_ENDED,

  /**
   * We've conceptually ended the view, although we're still continuing to track
   * trailing events. All VIEW_ENDED handlers have run.
   */
  AFTER_VIEW_ENDED,

  /**
   * We've stopped listening for trailing events for this view, and any final updates
   * have been sent to the intake, It's now safe to tear down any data structures
   * associated with this view.
   */
  VIEW_DESTROYED,

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
  AUTO_ACTION_COMPLETED: LifeCycleEventType.AUTO_ACTION_COMPLETED
  BEFORE_VIEW_CREATED: LifeCycleEventType.BEFORE_VIEW_CREATED
  VIEW_CREATED: LifeCycleEventType.VIEW_CREATED
  BEFORE_VIEW_UPDATED: LifeCycleEventType.BEFORE_VIEW_UPDATED
  VIEW_UPDATED: LifeCycleEventType.VIEW_UPDATED
  VIEW_ENDED: LifeCycleEventType.VIEW_ENDED
  AFTER_VIEW_ENDED: LifeCycleEventType.AFTER_VIEW_ENDED
  VIEW_DESTROYED: LifeCycleEventType.VIEW_DESTROYED
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
  [LifeCycleEventTypeAsConst.AUTO_ACTION_COMPLETED]: AutoAction
  [LifeCycleEventTypeAsConst.BEFORE_VIEW_CREATED]: ViewCreatedEvent
  [LifeCycleEventTypeAsConst.VIEW_CREATED]: ViewCreatedEvent
  [LifeCycleEventTypeAsConst.BEFORE_VIEW_UPDATED]: BeforeViewUpdateEvent
  [LifeCycleEventTypeAsConst.VIEW_UPDATED]: ViewEvent
  [LifeCycleEventTypeAsConst.VIEW_ENDED]: ViewEndedEvent
  [LifeCycleEventTypeAsConst.AFTER_VIEW_ENDED]: ViewEndedEvent
  [LifeCycleEventTypeAsConst.VIEW_DESTROYED]: ViewDestroyedEvent
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
