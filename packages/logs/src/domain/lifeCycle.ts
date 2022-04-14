import type { Context, Subscription } from '@datadog/browser-core'
import type { LogsEvent } from '../logsEvent.types'
import type { CommonContext, RawLogsEvent } from '../rawLogsEvent.types'
import type { Logger } from './logger'

export const enum LifeCycleEventType {
  RAW_LOG_COLLECTED,
  LOG_COLLECTED,
}

export class LifeCycle {
  private callbacks: { [key in LifeCycleEventType]?: Array<(data: any) => void> } = {}

  notify(eventType: LifeCycleEventType.RAW_LOG_COLLECTED, data: RawLogCollectedData): void
  notify(eventType: LifeCycleEventType.LOG_COLLECTED, data: LogsEvent & Context): void
  notify(eventType: LifeCycleEventType, data?: any) {
    const eventCallbacks = this.callbacks[eventType]
    if (eventCallbacks) {
      eventCallbacks.forEach((callback) => callback(data))
    }
  }
  subscribe(
    eventType: LifeCycleEventType.RAW_LOG_COLLECTED,
    callback: (data: RawLogCollectedData) => void
  ): Subscription
  subscribe(eventType: LifeCycleEventType.LOG_COLLECTED, callback: (data: LogsEvent & Context) => void): Subscription
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

export interface RawLogCollectedData<E extends RawLogsEvent = RawLogsEvent> {
  rawLog: E
  messageContext?: object
  savedCommonContext?: CommonContext
  logger?: Logger
}
