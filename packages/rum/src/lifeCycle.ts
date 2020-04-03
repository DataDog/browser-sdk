import { ErrorMessage, RequestDetails, RequestStartEvent } from '@datadog/browser-core'
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

export class LifeCycle {
  private callbacks: { [key in LifeCycleEventType]?: Array<(data: any) => void> } = {}

  notify(eventType: LifeCycleEventType.ERROR_COLLECTED, data: ErrorMessage): void
  notify(eventType: LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, data: PerformanceEntry): void
  notify(eventType: LifeCycleEventType.REQUEST_STARTED, data: RequestStartEvent): void
  notify(eventType: LifeCycleEventType.REQUEST_COLLECTED, data: RequestDetails): void
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

  subscribe(eventType: LifeCycleEventType.ERROR_COLLECTED, callback: (data: ErrorMessage) => void): void
  subscribe(eventType: LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, callback: (data: PerformanceEntry) => void): void
  subscribe(eventType: LifeCycleEventType.REQUEST_STARTED, callback: (data: RequestStartEvent) => void): void
  subscribe(eventType: LifeCycleEventType.REQUEST_COLLECTED, callback: (data: RequestDetails) => void): void
  subscribe(eventType: LifeCycleEventType.USER_ACTION_COLLECTED, callback: (data: UserAction) => void): void
  subscribe(
    eventType:
      | LifeCycleEventType.SESSION_RENEWED
      | LifeCycleEventType.RESOURCE_ADDED_TO_BATCH
      | LifeCycleEventType.DOM_MUTATED,
    callback: () => void
  ): void
  subscribe(eventType: LifeCycleEventType, callback: (data?: any) => void) {
    const eventCallbacks = this.callbacks[eventType]
    if (eventCallbacks) {
      eventCallbacks.push(callback)
    } else {
      this.callbacks[eventType] = [callback]
    }
  }
}
