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

  flush(): void {
    for (const batch of this.batches.values()) {
      batch.flush()
    }
  }

  destroy(): void {
    for (const batch of this.batches.values()) {
      batch.destroy()
    }
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
