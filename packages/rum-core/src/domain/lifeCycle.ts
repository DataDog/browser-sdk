import { Context, RawError, RelativeTime, Subscription } from '@datadog/browser-core'
import { RumPerformanceEntry } from '../browser/performanceCollection'
import { RumEventDomainContext } from '../domainContext.types'
import { CommonContext, RawRumEvent } from '../rawRumEvent.types'
import { RumEvent } from '../rumEvent.types'
import { RequestCompleteEvent, RequestStartEvent } from './requestCollection'
import { AutoAction, AutoActionCreatedEvent } from './rumEventsCollection/action/trackActions'
import { ViewEvent, ViewCreatedEvent, ViewEndedEvent } from './rumEventsCollection/view/trackViews'

export enum LifeCycleEventType {
  PERFORMANCE_ENTRY_COLLECTED,
  AUTO_ACTION_CREATED,
  AUTO_ACTION_COMPLETED,
  AUTO_ACTION_DISCARDED,
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
  BEFORE_UNLOAD,
  RAW_RUM_EVENT_COLLECTED,
  RUM_EVENT_COLLECTED,
  RAW_ERROR_COLLECTED,
}

export class LifeCycle {
  private callbacks: { [key in LifeCycleEventType]?: Array<(data: any) => void> } = {}

  notify(eventType: LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, data: RumPerformanceEntry): void
  notify(eventType: LifeCycleEventType.REQUEST_STARTED, data: RequestStartEvent): void
  notify(eventType: LifeCycleEventType.REQUEST_COMPLETED, data: RequestCompleteEvent): void
  notify(eventType: LifeCycleEventType.AUTO_ACTION_COMPLETED, data: AutoAction): void
  notify(eventType: LifeCycleEventType.AUTO_ACTION_CREATED, data: AutoActionCreatedEvent): void
  notify(eventType: LifeCycleEventType.VIEW_CREATED, data: ViewCreatedEvent): void
  notify(eventType: LifeCycleEventType.VIEW_UPDATED, data: ViewEvent): void
  notify(eventType: LifeCycleEventType.VIEW_ENDED, data: ViewEndedEvent): void
  notify(
    eventType: LifeCycleEventType.RAW_ERROR_COLLECTED,
    data: { error: RawError; savedCommonContext?: CommonContext; customerContext?: Context }
  ): void
  notify(
    eventType:
      | LifeCycleEventType.SESSION_EXPIRED
      | LifeCycleEventType.SESSION_RENEWED
      | LifeCycleEventType.BEFORE_UNLOAD
      | LifeCycleEventType.AUTO_ACTION_DISCARDED
  ): void
  notify(eventType: LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, data: RawRumEventCollectedData): void
  notify(eventType: LifeCycleEventType.RUM_EVENT_COLLECTED, data: RumEvent & Context): void
  notify(eventType: LifeCycleEventType, data?: any) {
    const eventCallbacks = this.callbacks[eventType]
    if (eventCallbacks) {
      eventCallbacks.forEach((callback) => callback(data))
    }
  }

  subscribe(
    eventType: LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED,
    callback: (data: RumPerformanceEntry) => void
  ): Subscription
  subscribe(eventType: LifeCycleEventType.REQUEST_STARTED, callback: (data: RequestStartEvent) => void): Subscription
  subscribe(
    eventType: LifeCycleEventType.REQUEST_COMPLETED,
    callback: (data: RequestCompleteEvent) => void
  ): Subscription
  subscribe(eventType: LifeCycleEventType.AUTO_ACTION_COMPLETED, callback: (data: AutoAction) => void): Subscription
  subscribe(
    eventType: LifeCycleEventType.AUTO_ACTION_CREATED,
    callback: (data: AutoActionCreatedEvent) => void
  ): Subscription
  subscribe(eventType: LifeCycleEventType.VIEW_CREATED, callback: (data: ViewCreatedEvent) => void): Subscription
  subscribe(eventType: LifeCycleEventType.VIEW_UPDATED, callback: (data: ViewEvent) => void): Subscription
  subscribe(eventType: LifeCycleEventType.VIEW_ENDED, callback: (data: ViewEndedEvent) => void): Subscription
  subscribe(
    eventType: LifeCycleEventType.RAW_ERROR_COLLECTED,
    callback: (data: { error: RawError; savedCommonContext?: CommonContext; customerContext?: Context }) => void
  ): Subscription
  subscribe(
    eventType:
      | LifeCycleEventType.SESSION_EXPIRED
      | LifeCycleEventType.SESSION_RENEWED
      | LifeCycleEventType.BEFORE_UNLOAD
      | LifeCycleEventType.AUTO_ACTION_DISCARDED,
    callback: () => void
  ): Subscription
  subscribe(
    eventType: LifeCycleEventType.RAW_RUM_EVENT_COLLECTED,
    callback: (data: RawRumEventCollectedData) => void
  ): Subscription
  subscribe(
    eventType: LifeCycleEventType.RUM_EVENT_COLLECTED,
    callback: (data: RumEvent & Context) => void
  ): Subscription
  subscribe(eventType: LifeCycleEventType, callback: (data?: any) => void) {
    if (!this.callbacks[eventType]) {
      this.callbacks[eventType] = []
    }
    this.callbacks[eventType]!.push(callback)
    return {
      unsubscribe: () => {
        this.callbacks[eventType] = this.callbacks[eventType]!.filter((other) => callback !== other)
      },
    }
  }
}

export interface RawRumEventCollectedData<E extends RawRumEvent = RawRumEvent> {
  startTime: RelativeTime
  savedCommonContext?: CommonContext
  customerContext?: Context
  rawRumEvent: E
  domainContext: RumEventDomainContext<E['type']>
}
