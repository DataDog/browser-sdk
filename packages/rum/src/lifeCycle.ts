import { ErrorMessage, RequestDetails } from '@browser-agent/core'
import { UserAction } from './rum'

export enum LifeCycleEventType {
  error,
  performance,
  userAction,
  request,
}

export class LifeCycle {
  private callbacks: { [key in LifeCycleEventType]?: Array<(data: any) => void> } = {}

  notify(eventType: LifeCycleEventType.error, data: ErrorMessage): void
  notify(eventType: LifeCycleEventType.performance, data: PerformanceEntry): void
  notify(eventType: LifeCycleEventType.request, data: RequestDetails): void
  notify(eventType: LifeCycleEventType.userAction, data: UserAction): void
  notify(eventType: LifeCycleEventType, data: any) {
    const eventCallbacks = this.callbacks[eventType]
    if (eventCallbacks) {
      eventCallbacks.forEach((callback) => callback(data))
    }
  }

  subscribe(eventType: LifeCycleEventType.error, callback: (data: ErrorMessage) => void): void
  subscribe(eventType: LifeCycleEventType.performance, callback: (data: PerformanceEntry) => void): void
  subscribe(eventType: LifeCycleEventType.request, callback: (data: RequestDetails) => void): void
  subscribe(eventType: LifeCycleEventType.userAction, callback: (data: UserAction) => void): void
  subscribe(eventType: LifeCycleEventType, callback: (data: any) => void) {
    const eventCallbacks = this.callbacks[eventType]
    if (eventCallbacks) {
      eventCallbacks.push(callback)
    } else {
      this.callbacks[eventType] = [callback]
    }
  }
}
