const DEFAULT_LIMIT = 10_000

export class BoundedBuffer<T> {
  private buffer: T[] = []

  constructor(private limit: number = DEFAULT_LIMIT) {}

  add(item: T) {
    this.buffer.push(item)
    const overlimitCount = this.buffer.length - this.limit
    if (overlimitCount > 0) {
      this.buffer.splice(0, overlimitCount)
    }
  }

  drain(fn: (item: T) => void) {
    this.buffer.forEach((item) => fn(item))
    this.buffer.length = 0
  }
}
