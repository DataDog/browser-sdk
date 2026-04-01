import { EventEmitter } from '../eventEmitter/eventEmitter'

interface Transport {
  send(data: string): void
  flush(): void
}

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
  private timer: ReturnType<typeof setTimeout> | undefined
  private readonly getSize: (message: string) => number

  constructor(private readonly options: BatchOptions) {
    super()
    this.getSize = options.getMessageSize ?? ((msg) => msg.length)
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
    clearTimeout(this.timer)
    this.timer = undefined
  }

  private scheduleFlush(): void {
    if (this.timer === undefined && this.options.flushTimeoutMs !== Infinity) {
      this.timer = setTimeout(() => this.flush(), this.options.flushTimeoutMs)
    }
  }
}

export type { Transport, BatchOptions }
export { Batch }
