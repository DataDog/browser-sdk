import type { Subscription } from '@datadog/browser-core'
import { topologicalSort } from '@datadog/browser-utils'
import type { Decorator, DecoratorFactory } from './types'

export type PipelineSubscription = Subscription

export class Pipeline<TEventMap extends Record<string, unknown>> {
  private factories = new Map<keyof TEventMap, Array<DecoratorFactory<any, any>>>()
  private decorators = new Map<keyof TEventMap, Array<Decorator<any, any>>>()
  private handlers = new Map<keyof TEventMap, Array<(event: any) => void>>()
  private queue: Array<{ type: keyof TEventMap; data: any }> = []
  private processing = false
  private sealed = false

  decorate<K extends keyof TEventMap>(eventType: K, factory: DecoratorFactory<TEventMap[K], any>): void {
    if (this.sealed) {
      throw new Error('Cannot add decorators after pipeline is sealed')
    }
    if (!this.factories.has(eventType)) {
      this.factories.set(eventType, [])
    }
    this.factories.get(eventType)!.push(factory)
  }

  subscribe<K extends keyof TEventMap>(eventType: K, handler: (event: TEventMap[K]) => void): PipelineSubscription {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, [])
    }
    const list = this.handlers.get(eventType)!
    list.push(handler)
    return {
      unsubscribe() {
        const idx = list.indexOf(handler)
        if (idx !== -1) list.splice(idx, 1)
      },
    }
  }

  seal(): void {
    if (this.sealed) {
      throw new Error('Pipeline is already sealed')
    }
    this.sealed = true
    for (const [eventType, factories] of this.factories) {
      const sorted = topologicalSort(factories)
      this.decorators.set(
        eventType,
        sorted.map((f) => f.create({}))
      )
    }
  }

  publish<K extends keyof TEventMap>(eventType: K, data: TEventMap[K]): void {
    if (!this.sealed) {
      throw new Error('Pipeline must be sealed before publishing events')
    }
    this.queue.push({ type: eventType, data })
    if (!this.processing) {
      void this.processQueue()
    }
  }

  private async processQueue(): Promise<void> {
    this.processing = true
    while (this.queue.length > 0) {
      const item = this.queue.shift()!
      try {
        const enriched = await this.runDecorators(item.type, item.data)
        if (enriched !== null) {
          for (const handler of this.handlers.get(item.type) ?? []) {
            handler(enriched)
          }
        }
      } catch {
        // A decorator threw — skip this event but continue processing the queue
        // TODO: wire to SDK telemetry once available
      }
    }
    this.processing = false
  }

  /**
   * Runs the decorator DAG for the given event type, accumulating contributed attributes.
   *
   * If multiple decorators contribute attributes with the same key, the last one wins.
   * Decorators should use unique, namespaced keys to avoid collisions.
   * The DAG ordering (provides/requires) ensures dependent decorators run after their providers,
   * but independent decorators with overlapping keys are not detected.
   *
   * Returns the enriched event, or null if any decorator discards it.
   */
  private async runDecorators<K extends keyof TEventMap>(
    eventType: K,
    data: TEventMap[K]
  ): Promise<TEventMap[K] | null> {
    const decoratorList = this.decorators.get(eventType) ?? []
    let accumulated: Record<string, unknown> = {}

    for (const decorator of decoratorList) {
      const result = await decorator.decorate(data, accumulated)
      if (result.status === 'discarded') {
        return null
      }
      if (result.status === 'contributed') {
        accumulated = { ...accumulated, ...(result.attributes as object) }
      }
    }

    if (typeof data === 'object' && data !== null) {
      return { ...(data as object), ...accumulated } as TEventMap[K]
    }
    return data
  }
}
