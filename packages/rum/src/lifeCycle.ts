import { ErrorMessage, RequestCompleteEvent, RequestStartEvent } from '@datadog/browser-core'
import { ActionContext, ViewContext } from './parentContexts'
import { UserAction } from './userActionCollection'
import { View } from './viewCollection'

export enum LifeCycleEventType {
  ERROR_COLLECTED,
  PERFORMANCE_ENTRY_COLLECTED,
  ACTION_CREATED,
  ACTION_COMPLETED,
  ACTION_DISCARDED,
  VIEW_CREATED,
  VIEW_UPDATED,
  REQUEST_STARTED,
  REQUEST_COMPLETED,
  SESSION_RENEWED,
  RESOURCE_ADDED_TO_BATCH,
  DOM_MUTATED,
  BEFORE_UNLOAD,
}

export interface Subscription {
  unsubscribe(): void
}

export class LifeCycle {
  private callbacks: { [key in LifeCycleEventType]?: Array<(data: any) => void> } = {}

  notify(eventType: LifeCycleEventType.ERROR_COLLECTED, data: ErrorMessage): void
  notify(eventType: LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, data: PerformanceEntry): void
  notify(eventType: LifeCycleEventType.REQUEST_STARTED, data: RequestStartEvent): void
  notify(eventType: LifeCycleEventType.REQUEST_COMPLETED, data: RequestCompleteEvent): void
  notify(eventType: LifeCycleEventType.ACTION_COMPLETED, data: UserAction): void
  notify(
    eventType: LifeCycleEventType.ACTION_CREATED,
    { actionContext, startTime }: { actionContext: ActionContext; startTime: number }
  ): void
  notify(
    eventType: LifeCycleEventType.VIEW_CREATED,
    { viewContext, startTime }: { viewContext: ViewContext; startTime: number }
  ): void
  notify(eventType: LifeCycleEventType.VIEW_UPDATED, data: View): void
  notify(
    eventType:
      | LifeCycleEventType.SESSION_RENEWED
      | LifeCycleEventType.RESOURCE_ADDED_TO_BATCH
      | LifeCycleEventType.DOM_MUTATED
      | LifeCycleEventType.BEFORE_UNLOAD
      | LifeCycleEventType.ACTION_DISCARDED
  ): void
  notify(eventType: LifeCycleEventType, data?: any) {
    const eventCallbacks = this.callbacks[eventType]
    if (eventCallbacks) {
      eventCallbacks.forEach((callback) => callback(data))
    }
  }

  subscribe(eventType: LifeCycleEventType.ERROR_COLLECTED, callback: (data: ErrorMessage) => void): Subscription
  subscribe(
    eventType: LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED,
    callback: (data: PerformanceEntry) => void
  ): Subscription
  subscribe(eventType: LifeCycleEventType.REQUEST_STARTED, callback: (data: RequestStartEvent) => void): Subscription
  subscribe(
    eventType: LifeCycleEventType.REQUEST_COMPLETED,
    callback: (data: RequestCompleteEvent) => void
  ): Subscription
  subscribe(eventType: LifeCycleEventType.ACTION_COMPLETED, callback: (data: UserAction) => void): Subscription
  subscribe(
    eventType: LifeCycleEventType.ACTION_CREATED,
    callback: ({ actionContext, startTime }: { actionContext: ActionContext; startTime: number }) => void
  ): Subscription
  subscribe(
    eventType: LifeCycleEventType.VIEW_CREATED,
    callback: ({ viewContext, startTime }: { viewContext: ViewContext; startTime: number }) => void
  ): Subscription
  subscribe(eventType: LifeCycleEventType.VIEW_UPDATED, callback: (data: View) => void): Subscription
  subscribe(
    eventType:
      | LifeCycleEventType.SESSION_RENEWED
      | LifeCycleEventType.RESOURCE_ADDED_TO_BATCH
      | LifeCycleEventType.DOM_MUTATED
      | LifeCycleEventType.BEFORE_UNLOAD
      | LifeCycleEventType.ACTION_DISCARDED,
    callback: () => void
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
