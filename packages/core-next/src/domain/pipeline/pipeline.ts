import type { Enricher } from '../enricher/types'
import { chain } from '../enricher/chain'

/**
 * Handle returned by {@link Pipeline.subscribe} to remove a subscription.
 */
export interface Subscription {
  /** Removes the subscription. The handler will no longer be called for new events. */
  unsubscribe: () => void
}

/**
 * A typed pub/sub event bus with enricher support.
 *
 * The pipeline has two phases:
 *
 * **Registration phase** (before {@link seal}):
 * - Register enrichers per event type with {@link enrich}.
 * - Subscribe to event types with {@link subscribe}.
 * - Events published during this phase are buffered and processed after sealing.
 *
 * **Active phase** (after {@link seal}):
 * - Enrichers are topologically sorted into a {@link chain} per event type.
 * - Published events are processed sequentially through the chain.
 * - If any enricher returns `null`, the event is discarded (subscribers are not notified).
 * - If an enricher throws, the event is skipped and processing continues with the next event.
 *
 * @example
 * ```ts
 * type Events = {
 *   observation: { type: string; startTime: number }
 *   signal: { type: 'sessionExpired' } | { type: 'viewCreated' }
 * }
 *
 * const pipeline = new Pipeline<Events>()
 *
 * pipeline.enrich('observation', sessionEnricher)
 * pipeline.enrich('observation', viewEnricher)
 *
 * pipeline.subscribe('observation', (event) => {
 *   // event is enriched with session and view data
 * })
 *
 * pipeline.subscribe('signal', (signal) => {
 *   // signals pass through without enrichment
 * })
 *
 * pipeline.seal()
 *
 * pipeline.publish('observation', { type: 'error', startTime: 123 })
 * pipeline.publish('signal', { type: 'sessionExpired' })
 * ```
 * @typeParam TEventMap - A record mapping event type names to their data types.
 */
// eslint-disable-next-line no-restricted-syntax
export class Pipeline<TEventMap extends Record<string, unknown>> {
  private enrichers = new Map<keyof TEventMap, Enricher<any, any, any>[]>()
  private chains = new Map<keyof TEventMap, (data: any) => Promise<any | null>>()
  private handlers = new Map<keyof TEventMap, ((event: any) => void)[]>()
  private queue: { type: keyof TEventMap; data: any }[] = []
  private processing = false
  private sealed = false

  /**
   * Registers an enricher for the given event type.
   * Must be called before {@link seal}. Throws if the pipeline is already sealed.
   *
   * @param eventType - The event type key from `TEventMap`.
   * @param enricher - The enricher to register.
   */
  enrich<K extends keyof TEventMap>(eventType: K, enricher: Enricher<any, any, any>): void {
    if (this.sealed) {
      throw new Error('Cannot add enrichers after pipeline is sealed')
    }
    if (!this.enrichers.has(eventType)) {
      this.enrichers.set(eventType, [])
    }
    this.enrichers.get(eventType)!.push(enricher)
  }

  /**
   * Subscribes to events of the given type. The handler is called with the enriched event
   * after all enrichers have processed it. Can be called before or after {@link seal}.
   *
   * @param eventType - The event type key from `TEventMap`.
   * @param handler - Called with the enriched event data.
   * @returns A {@link Subscription} to remove the handler.
   */
  subscribe<K extends keyof TEventMap>(eventType: K, handler: (event: TEventMap[K]) => void): Subscription {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, [])
    }
    const list = this.handlers.get(eventType)!
    list.push(handler)
    return {
      unsubscribe() {
        const idx = list.indexOf(handler)
        if (idx !== -1) {
          list.splice(idx, 1)
        }
      },
    }
  }

  /**
   * Freezes enricher registration and builds the enricher chains.
   * Drains any events that were buffered before sealing.
   * Throws if called more than once.
   */
  seal(): void {
    if (this.sealed) {
      throw new Error('Pipeline is already sealed')
    }
    this.sealed = true
    for (const [eventType, enricherList] of this.enrichers) {
      this.chains.set(eventType, chain(enricherList))
    }
    if (this.queue.length > 0) {
      void this.processQueue()
    }
  }

  /**
   * Publishes an event. If the pipeline is sealed, the event is processed immediately
   * (sequentially after any in-flight events). If not yet sealed, the event is buffered.
   *
   * @param eventType - The event type key from `TEventMap`.
   * @param data - The event data.
   */
  publish<K extends keyof TEventMap>(eventType: K, data: TEventMap[K]): void {
    this.queue.push({ type: eventType, data })
    if (this.sealed && !this.processing) {
      void this.processQueue()
    }
  }

  private async processQueue(): Promise<void> {
    this.processing = true
    while (this.queue.length > 0) {
      const item = this.queue.shift()!
      try {
        const process = this.chains.get(item.type)
        const result = process ? await process(item.data) : item.data
        if (result !== null) {
          for (const handler of this.handlers.get(item.type) ?? []) {
            handler(result)
          }
        }
      } catch {
        // An enricher threw — skip this event but continue processing the queue
      }
    }
    this.processing = false
  }
}
