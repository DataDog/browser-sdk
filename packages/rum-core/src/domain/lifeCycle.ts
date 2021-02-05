import { Context } from '@datadog/browser-core'
import { RumPerformanceEntry } from '../browser/performanceCollection'
import { CommonContext, RawRumEvent } from '../rawRumEvent.types'
import { RumEvent } from '../rumEvent.types'
import { RequestCompleteEvent, RequestStartEvent } from './requestCollection'
import { AutoAction, AutoActionCreatedEvent } from './rumEventsCollection/action/trackActions'
import { View, ViewCreatedEvent } from './rumEventsCollection/view/trackViews'

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
  SESSION_RENEWED,
  DOM_MUTATED,
  BEFORE_UNLOAD,
  RAW_RUM_EVENT_COLLECTED,
  RUM_EVENT_COLLECTED,
}

export interface Subscription {
  unsubscribe: () => void
}

export class LifeCycle {
  private callbacks: { [key in LifeCycleEventType]?: Array<(data: any) => void> } = {}

  notify(eventType: LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, data: RumPerformanceEntry): void
  notify(eventType: LifeCycleEventType.REQUEST_STARTED, data: RequestStartEvent): void
  notify(eventType: LifeCycleEventType.REQUEST_COMPLETED, data: RequestCompleteEvent): void
  notify(eventType: LifeCycleEventType.AUTO_ACTION_COMPLETED, data: AutoAction): void
  notify(eventType: LifeCycleEventType.AUTO_ACTION_CREATED, data: AutoActionCreatedEvent): void
  notify(eventType: LifeCycleEventType.VIEW_CREATED, data: ViewCreatedEvent): void
  notify(eventType: LifeCycleEventType.VIEW_UPDATED, data: View): void
  notify(
    eventType:
      | LifeCycleEventType.SESSION_RENEWED
      | LifeCycleEventType.DOM_MUTATED
      | LifeCycleEventType.BEFORE_UNLOAD
      | LifeCycleEventType.AUTO_ACTION_DISCARDED
      | LifeCycleEventType.VIEW_ENDED
  ): void
  notify(
    eventType: LifeCycleEventType.RAW_RUM_EVENT_COLLECTED,
    data: {
      startTime: number
      rawRumEvent: RawRumEvent
      savedCommonContext?: CommonContext
      customerContext?: Context
    }
  ): void
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
  subscribe(eventType: LifeCycleEventType.VIEW_UPDATED, callback: (data: View) => void): Subscription
  subscribe(
    eventType:
      | LifeCycleEventType.SESSION_RENEWED
      | LifeCycleEventType.DOM_MUTATED
      | LifeCycleEventType.BEFORE_UNLOAD
      | LifeCycleEventType.AUTO_ACTION_DISCARDED
      | LifeCycleEventType.VIEW_ENDED,
    callback: () => void
  ): Subscription
  subscribe(
    eventType: LifeCycleEventType.RAW_RUM_EVENT_COLLECTED,
    callback: (data: {
      startTime: number
      rawRumEvent: RawRumEvent
      savedCommonContext?: CommonContext
      customerContext?: Context
    }) => void
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
