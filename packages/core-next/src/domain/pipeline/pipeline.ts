import type { AnyEnricher } from '../enricher'
import { chain } from '../enricher'

/**
 * Handle returned by {@link Pipeline.subscribe} to remove a subscription.
 */
interface Subscription {
  /** Removes the subscription. The handler will no longer be called for new events. */
  unsubscribe: () => void
}

/**
 * A typed pub/sub event bus with enricher support and pattern matching.
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
 * **Pattern matching:**
   * - `'*'` matches all event types.
   * - `'observation:*'` matches all event types starting with `observation:`.
   * - `'observation:rum_*'` matches all event types starting with `observation:rum_`.
   * - Exact keys match only the specific event type.
 *
 * @example
 * ```ts
 * const pipeline = new Pipeline<Events>()
 *
 * // Enrich all observations
 * pipeline.enrich('observation:*', sessionEnricher)
 *
 * // Subscribe to all observations
 * pipeline.subscribe('observation:*', (event) => batch.add(event))
 *
 * // Enrich everything
 * pipeline.enrich('*', timestampEnricher)
 * ```
 * @typeParam TEventMap - A record mapping event type names to their data types.
 */
interface PipelineOptions {
  onError?: (error: unknown) => void
}

function matchesPattern(pattern: string, eventType: string): boolean {
  if (pattern === '*') {
    return true
  }
  if (pattern.endsWith('*')) {
    return eventType.startsWith(pattern.slice(0, -1))
  }
  return pattern === eventType
}

function isPattern(key: string): boolean {
  return key.includes('*')
}

class Pipeline<TEventMap extends Record<string, unknown>> {
  private enrichers = new Map<string, AnyEnricher[]>()
  private chains = new Map<string, (data: any) => Promise<any | null>>()
  private handlers = new Map<string, ((event: any) => void)[]>()
  private queue: { type: string; data: any }[] = []
  private processing = false
  private sealed = false
  private readonly onError: ((error: unknown) => void) | undefined

  constructor(options?: PipelineOptions) {
    this.onError = options?.onError
  }

  /**
   * Registers an enricher for the given event type or pattern.
   * Must be called before {@link seal}. Throws if the pipeline is already sealed.
   *
   * Supports patterns: `'*'` for all events, `'observation:*'` or `'observation:rum_*'` for prefix matching.
   *
   * @param eventType - The event type key or pattern.
   * @param enricher - The enricher to register.
   */
  enrich(eventType: keyof TEventMap | (string & {}), enricher: AnyEnricher): void {
    if (this.sealed) {
      throw new Error('Cannot add enrichers after pipeline is sealed')
    }
    const key = eventType as string
    if (!this.enrichers.has(key)) {
      this.enrichers.set(key, [])
    }
    this.enrichers.get(key)!.push(enricher)
  }

  /**
   * Subscribes to events of the given type or pattern. The handler is called with the enriched
   * event after all enrichers have processed it. Can be called before or after {@link seal}.
   *
   * Supports patterns: `'*'` for all events, `'observation:*'` for prefix matching.
   *
   * @param eventType - The event type key or pattern.
   * @param handler - Called with the enriched event data.
   * @returns A {@link Subscription} to remove the handler.
   */
  subscribe<K extends keyof TEventMap>(eventType: K, handler: (event: TEventMap[K]) => void): Subscription
  subscribe(eventType: string, handler: (event: any) => void): Subscription
  subscribe(eventType: string, handler: (event: any) => void): Subscription {
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
    this.queue.push({ type: eventType as string, data })
    if (this.sealed && !this.processing) {
      void this.processQueue()
    }
  }

  /**
   * Collects enrichers that match the given event type — exact key enrichers
   * plus any pattern enrichers whose glob matches.
   */
  private getChainForEventType(eventType: string): ((data: any) => Promise<any | null>) | undefined {
    const enrichers: AnyEnricher[] = []

    for (const [key, list] of this.enrichers) {
      if (key === eventType || (isPattern(key) && matchesPattern(key, eventType))) {
        enrichers.push(...list)
      }
    }

    if (enrichers.length === 0) {
      return undefined
    }

    return chain(enrichers)
  }

  /**
   * Collects handlers that match the given event type — exact key handlers
   * plus any pattern handlers whose glob matches.
   */
  private getHandlersForEventType(eventType: string): ((event: any) => void)[] {
    const handlers: ((event: any) => void)[] = []

    for (const [key, list] of this.handlers) {
      if (key === eventType || (isPattern(key) && matchesPattern(key, eventType))) {
        handlers.push(...list)
      }
    }

    return handlers
  }

  private resolveChain(eventType: string): ((data: any) => Promise<any | null>) | undefined {
    if (this.chains.has(eventType)) {
      return this.chains.get(eventType)
    }
    const resolved = this.getChainForEventType(eventType)
    if (resolved) {
      this.chains.set(eventType, resolved)
    }
    return resolved
  }

  private async processQueue(): Promise<void> {
    this.processing = true
    while (this.queue.length > 0) {
      const item = this.queue.shift()!
      try {
        const process = this.sealed ? this.resolveChain(item.type) : undefined
        const result = process ? await process(item.data) : item.data
        if (result !== null) {
          for (const handler of this.getHandlersForEventType(item.type)) {
            handler(result)
          }
        }
      } catch (error) {
        this.onError?.(error)
      }
    }
    this.processing = false
  }
}

export type { Subscription, PipelineOptions }
export { Pipeline }
