import { EventEmitter, throttle } from '../../utils'

interface BatchOptions {
  flushTimeoutMs: number
  getMessageSize?: (message: string) => number
  maxCount: number
  maxSizeBytes: number
}

interface BatchEvents {
  flush: string[]
}

function defaultGetMessageSize(message: string) {
  return message.length
}

class Batch extends EventEmitter<BatchEvents> {
  private buffer: string[] = []
  private currentSize = 0
  private readonly getSize: (message: string) => number
  private readonly schedule: () => void
  private readonly cancel: () => void

  constructor(private readonly options: BatchOptions) {
    super()
    this.getSize = options.getMessageSize ?? defaultGetMessageSize

    const { throttled, cancel } = throttle(() => this.flush(), options.flushTimeoutMs, {
      leading: false,
      trailing: true,
    })
    this.schedule = throttled
    this.cancel = cancel
  }

  add(message: string): void {
    const messageSize = this.getSize(message)

    const hasMessages = this.buffer.length > 0
    const wouldExceedSize = this.currentSize + messageSize > this.options.maxSizeBytes
    const wouldExceedCount = this.buffer.length >= this.options.maxCount

    if (hasMessages && (wouldExceedSize || wouldExceedCount)) {
      this.flush()
    }

    this.buffer.push(message)
    this.currentSize += messageSize
    this.schedule()
  }

  flush(): void {
    if (this.buffer.length === 0) {
      return
    }

    this.emit('flush', this.buffer)
    this.buffer = []
    this.currentSize = 0
    this.cancel()
  }
}

export type { BatchOptions }
export { Batch }
