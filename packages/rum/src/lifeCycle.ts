import { ErrorMessage, RequestCompleteEvent, RequestStartEvent } from '@datadog/browser-core'
import { UserAction } from './rum'

export enum LifeCycleEventType {
  ERROR_COLLECTED,
  PERFORMANCE_ENTRY_COLLECTED,
  USER_ACTION_COLLECTED,
  REQUEST_STARTED,
  REQUEST_COLLECTED,
  SESSION_RENEWED,
  RESOURCE_ADDED_TO_BATCH,
  DOM_MUTATED,
}

export interface Subscription {
  unsubscribe(): void
}

export class LifeCycle {
  private callbacks: { [key in LifeCycleEventType]?: Array<(data: any) => void> } = {}

  notify(eventType: LifeCycleEventType.ERROR_COLLECTED, data: ErrorMessage): void
  notify(eventType: LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, data: PerformanceEntry): void
  notify(eventType: LifeCycleEventType.REQUEST_STARTED, data: RequestStartEvent): void
  notify(eventType: LifeCycleEventType.REQUEST_COLLECTED, data: RequestCompleteEvent): void
  notify(eventType: LifeCycleEventType.USER_ACTION_COLLECTED, data: UserAction): void
  notify(
    eventType:
      | LifeCycleEventType.SESSION_RENEWED
      | LifeCycleEventType.RESOURCE_ADDED_TO_BATCH
      | LifeCycleEventType.DOM_MUTATED
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
    eventType: LifeCycleEventType.REQUEST_COLLECTED,
    callback: (data: RequestCompleteEvent) => void
  ): Subscription
  subscribe(eventType: LifeCycleEventType.USER_ACTION_COLLECTED, callback: (data: UserAction) => void): Subscription
  subscribe(
    eventType:
      | LifeCycleEventType.SESSION_RENEWED
      | LifeCycleEventType.RESOURCE_ADDED_TO_BATCH
      | LifeCycleEventType.DOM_MUTATED,
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
