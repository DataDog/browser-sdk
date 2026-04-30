import { Batch } from '@datadog/core-next'
import type { Pipeline } from '@datadog/core-next'
import type { HttpRequest } from '../browser'

interface TransportRouterOptions {
  pipeline: Pipeline<Record<string, unknown>>
  transports: Map<string, HttpRequest>
  batchOptions: { maxSizeBytes: number; maxCount: number; flushTimeoutMs: number }
  beforeSend?: (event: Record<string, unknown>) => boolean | void
}

class TransportRouter {
  private batches = new Map<string, Batch>()
  private dedupBuffers = new Map<string, Map<string, string>>()
  private readonly options: TransportRouterOptions

  constructor(options: TransportRouterOptions) {
    this.options = options
  }

  route(eventType: string, trackType: string): void {
    this.ensureBatch(trackType)
    this.options.pipeline.subscribe(eventType, (event) => {
      if (this.options.beforeSend && this.options.beforeSend(event as Record<string, unknown>) === false) {
        return
      }
      this.batches.get(trackType)?.add(JSON.stringify(event))
    })
  }

  /**
   * Route events with deduplication. Events with the same key (extracted by keyFn)
   * replace the previous event in the buffer. Only the latest event per key is
   * included when the batch flushes.
   *
   * This is a workaround for view events that update progressively — the backend
   * only needs the latest state per view ID.
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
      if (this.options.beforeSend && this.options.beforeSend(event as Record<string, unknown>) === false) {
        return
      }
      const key = keyFn(event as Record<string, unknown>)
      dedupBuffer.set(key, JSON.stringify(event))
    })
  }

  flush(): void {
    // Flush dedup buffers into batches before flushing
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
