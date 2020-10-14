import { Context, ErrorMessage } from '@datadog/browser-core'
import { RumEvent } from './assembly'
import { RumPerformanceEntry } from './performanceCollection'
import { RequestCompleteEvent, RequestStartEvent } from './requestCollection'
import { RawRumEvent } from './rum'
import { AutoActionCreatedEvent, AutoUserAction, CustomUserAction } from './userActionCollection'
import { View, ViewCreatedEvent } from './viewCollection'

export enum LifeCycleEventType {
  ERROR_COLLECTED,
  PERFORMANCE_ENTRY_COLLECTED,
  CUSTOM_ACTION_COLLECTED,
  AUTO_ACTION_CREATED,
  AUTO_ACTION_COMPLETED,
  AUTO_ACTION_DISCARDED,
  VIEW_CREATED,
  VIEW_UPDATED,
  REQUEST_STARTED,
  REQUEST_COMPLETED,
  SESSION_RENEWED,
  RESOURCE_ADDED_TO_BATCH,
  DOM_MUTATED,
  BEFORE_UNLOAD,
  RAW_RUM_EVENT_COLLECTED,
  RUM_EVENT_COLLECTED,
}

export interface Subscription {
  unsubscribe(): void
}

export class LifeCycle {
  private callbacks: { [key in LifeCycleEventType]?: Array<(data: any) => void> } = {}

  notify(eventType: LifeCycleEventType.ERROR_COLLECTED, data: ErrorMessage): void
  notify(eventType: LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, data: RumPerformanceEntry): void
  notify(eventType: LifeCycleEventType.REQUEST_STARTED, data: RequestStartEvent): void
  notify(eventType: LifeCycleEventType.REQUEST_COMPLETED, data: RequestCompleteEvent): void
  notify(eventType: LifeCycleEventType.AUTO_ACTION_COMPLETED, data: AutoUserAction): void
  notify(
    eventType: LifeCycleEventType.CUSTOM_ACTION_COLLECTED,
    data: { action: CustomUserAction; context?: Context }
  ): void
  notify(eventType: LifeCycleEventType.AUTO_ACTION_CREATED, data: AutoActionCreatedEvent): void
  notify(eventType: LifeCycleEventType.VIEW_CREATED, data: ViewCreatedEvent): void
  notify(eventType: LifeCycleEventType.VIEW_UPDATED, data: View): void
  notify(
    eventType:
      | LifeCycleEventType.SESSION_RENEWED
      | LifeCycleEventType.RESOURCE_ADDED_TO_BATCH
      | LifeCycleEventType.DOM_MUTATED
      | LifeCycleEventType.BEFORE_UNLOAD
      | LifeCycleEventType.AUTO_ACTION_DISCARDED
  ): void
  notify(
    eventType: LifeCycleEventType.RAW_RUM_EVENT_COLLECTED,
    data: {
      startTime: number
      rawRumEvent: RawRumEvent
      savedGlobalContext?: Context
      customerContext?: Context
    }
  ): void
  notify(eventType: LifeCycleEventType.RUM_EVENT_COLLECTED, data: { rumEvent: RumEvent; serverRumEvent: Context }): void
  notify(eventType: LifeCycleEventType, data?: any) {
    const eventCallbacks = this.callbacks[eventType]
    if (eventCallbacks) {
      eventCallbacks.forEach((callback) => callback(data))
    }
  }

  subscribe(eventType: LifeCycleEventType.ERROR_COLLECTED, callback: (data: ErrorMessage) => void): Subscription
  subscribe(
    eventType: LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED,
    callback: (data: RumPerformanceEntry) => void
  ): Subscription
  subscribe(eventType: LifeCycleEventType.REQUEST_STARTED, callback: (data: RequestStartEvent) => void): Subscription
  subscribe(
    eventType: LifeCycleEventType.REQUEST_COMPLETED,
    callback: (data: RequestCompleteEvent) => void
  ): Subscription
  subscribe(eventType: LifeCycleEventType.AUTO_ACTION_COMPLETED, callback: (data: AutoUserAction) => void): Subscription
  subscribe(
    eventType: LifeCycleEventType.AUTO_ACTION_CREATED,
    callback: (data: AutoActionCreatedEvent) => void
  ): Subscription
  subscribe(
    eventType: LifeCycleEventType.CUSTOM_ACTION_COLLECTED,
    callback: (data: { action: CustomUserAction; context?: Context }) => void
  ): Subscription
  subscribe(eventType: LifeCycleEventType.VIEW_CREATED, callback: (data: ViewCreatedEvent) => void): Subscription
  subscribe(eventType: LifeCycleEventType.VIEW_UPDATED, callback: (data: View) => void): Subscription
  subscribe(
    eventType:
      | LifeCycleEventType.SESSION_RENEWED
      | LifeCycleEventType.RESOURCE_ADDED_TO_BATCH
      | LifeCycleEventType.DOM_MUTATED
      | LifeCycleEventType.BEFORE_UNLOAD
      | LifeCycleEventType.AUTO_ACTION_DISCARDED,
    callback: () => void
  ): Subscription
  subscribe(
    eventType: LifeCycleEventType.RAW_RUM_EVENT_COLLECTED,
    callback: (data: {
      startTime: number
      rawRumEvent: RawRumEvent
      savedGlobalContext?: Context
      customerContext?: Context
    }) => void
  ): void
  subscribe(
    eventType: LifeCycleEventType.RUM_EVENT_COLLECTED,
    callback: (data: { rumEvent: RumEvent; serverRumEvent: Context }) => void
  ): void
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
