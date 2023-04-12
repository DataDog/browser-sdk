import type { Subscription } from './observable'

/**
 * Type helper to extract event types that have "void" data. This allows to call `notify` without a
 * second argument. Ex:
 *
 * ```
 * interface EventMap {
 *   foo: void
 * }
 * const LifeCycle = AbstractLifeCycle<EventMap>
 * new LifeCycle().notify('foo')
 * ```
 */
type EventTypesWithoutData<EventMap> = {
  [K in keyof EventMap]: EventMap[K] extends void ? K : never
}[keyof EventMap]

export class AbstractLifeCycle<EventMap> {
  private callbacks: { [key in keyof EventMap]?: Array<(data: any) => void> } = {}

  notify<EventType extends EventTypesWithoutData<EventMap>>(eventType: EventType): void
  notify<EventType extends keyof EventMap>(eventType: EventType, data: EventMap[EventType]): void
  notify(eventType: keyof EventMap, data?: unknown) {
    const eventCallbacks = this.callbacks[eventType]
    if (eventCallbacks) {
      eventCallbacks.forEach((callback) => callback(data))
    }
  }

  subscribe<EventType extends keyof EventMap>(
    eventType: EventType,
    callback: (data: EventMap[EventType]) => void
  ): Subscription {
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
