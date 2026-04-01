import { EventEmitter, throttle } from '../../utils'

interface BatchOptions {
  maxSizeBytes: number
  maxCount: number
  flushTimeoutMs: number
  getMessageSize?: (message: string) => number
}

interface BatchEvents {
  flush: string[]
}

class Batch extends EventEmitter<BatchEvents> {
  private buffer: string[] = []
  private currentSize = 0
  private readonly getSize: (message: string) => number
  private readonly scheduleFlush: () => void
  private readonly cancelScheduledFlush: () => void

  constructor(private readonly options: BatchOptions) {
    super()
    this.getSize = options.getMessageSize ?? ((msg) => msg.length)

    const { throttled, cancel } = throttle(() => this.flush(), options.flushTimeoutMs, {
      leading: false,
      trailing: true,
    })
    this.scheduleFlush = throttled
    this.cancelScheduledFlush = cancel
  }

  add(message: string): void {
    this.buffer.push(message)
    this.currentSize += this.getSize(message)
    this.scheduleFlush()

    if (this.currentSize > this.options.maxSizeBytes || this.buffer.length >= this.options.maxCount) {
      this.flush()
    }
  }

  flush(): void {
    if (this.buffer.length === 0) {
      return
    }
    this.emit('flush', this.buffer)
    this.buffer = []
    this.currentSize = 0
    this.cancelScheduledFlush()
  }
}

export type { BatchOptions }
export { Batch }
