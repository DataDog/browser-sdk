const DEFAULT_LIMIT = 10_000

export class BoundedBuffer<T> {
  private buffer: T[] = []

  constructor(private limit: number = DEFAULT_LIMIT) {}

  add(item: T) {
    const length = this.buffer.push(item)
    if (length > this.limit) {
      this.buffer.splice(0, 1)
    }
  }

  drain(fn: (item: T) => void) {
    this.buffer.forEach((item) => fn(item))
    this.buffer.length = 0
  }
}
