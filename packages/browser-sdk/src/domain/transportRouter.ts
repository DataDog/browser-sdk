import { Batch } from '@datadog/core-next'
import type { Pipeline } from '@datadog/core-next'
import type { HttpRequest } from '../browser'

type EventInterceptor = (event: Record<string, unknown>) => boolean | void

interface TransportRouterOptions {
  pipeline: Pipeline<Record<string, unknown>>
  transports: Map<string, HttpRequest>
  batchOptions: { maxSizeBytes: number; maxCount: number; flushTimeoutMs: number }
  beforeSend?: EventInterceptor
  onEventReady?: (event: Record<string, unknown>) => void
}

class TransportRouter {
  private batches = new Map<string, Batch>()
  private dedupBuffers = new Map<string, Map<string, string>>()
  private readonly options: TransportRouterOptions

  constructor(options: TransportRouterOptions) {
    this.options = options
  }

  /**
   * Process an event through the transport chain:
   * 1. beforeSend — customer can discard
   * 2. onEventReady — dev tools / extension callback
   * 3. Return serialized JSON for batching
   *
   * Returns undefined if the event was discarded.
   */
  private processEvent(event: unknown): string | undefined {
    const record = event as Record<string, unknown>

    // 1. beforeSend gate
    if (this.options.beforeSend && this.options.beforeSend(record) === false) {
      return undefined
    }

    // 2. Extension callback (dev tools hook)
    this.options.onEventReady?.(record)

    // 3. Serialize
    return JSON.stringify(event)
  }

  route(eventType: string, trackType: string): void {
    this.ensureBatch(trackType)
    this.options.pipeline.subscribe(eventType, (event) => {
      const serialized = this.processEvent(event)
      if (serialized) {
        this.batches.get(trackType)?.add(serialized)
      }
    })
  }

  /**
   * Route events with deduplication. Events with the same key (extracted by keyFn)
   * replace the previous event in the buffer. Only the latest event per key is
   * included when the batch flushes.
   */
  routeWithDedup(
    eventType: string,
    trackType: string,
    keyFn: (event: Record<string, unknown>) => string
  ): void {
    this.ensureBatch(trackType)

    if (!this.dedupBuffers.has(trackType)) {
      this.dedupBuffers.set(trackType, new Map())
    }
    const dedupBuffer = this.dedupBuffers.get(trackType)!

    this.options.pipeline.subscribe(eventType, (event) => {
      const serialized = this.processEvent(event)
      if (serialized) {
        const key = keyFn(event as Record<string, unknown>)
        dedupBuffer.set(key, serialized)
      }
    })
  }

  flush(): void {
    // Drain dedup buffers into batches before flushing
    for (const [trackType, dedupBuffer] of this.dedupBuffers) {
      const batch = this.batches.get(trackType)
      if (batch && dedupBuffer.size > 0) {
        for (const serialized of dedupBuffer.values()) {
          batch.add(serialized)
        }
        dedupBuffer.clear()
      }
    }

    for (const batch of this.batches.values()) {
      batch.flush()
    }
  }

  destroy(): void {
    for (const batch of this.batches.values()) {
      batch.destroy()
    }
    this.dedupBuffers.clear()
  }

  private ensureBatch(trackType: string): void {
    if (this.batches.has(trackType)) {
      return
    }
    const batch = new Batch(this.options.batchOptions)
    const transport = this.options.transports.get(trackType)
    if (transport) {
      batch.on('flush', (messages) => {
        const data = messages.join('\n')
        transport.send({ data, bytesCount: new Blob([data]).size })
      })
    }
    this.batches.set(trackType, batch)
  }
}

export { TransportRouter }
export type { TransportRouterOptions }
