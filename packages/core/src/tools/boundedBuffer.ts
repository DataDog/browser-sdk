const DEFAULT_LIMIT = 10_000

export class BoundedBuffer {
  private buffer: Array<[any, (item: any) => void]> = []

  constructor(private limit: number = DEFAULT_LIMIT) {}

  add<T>(item: T, drainFn: (item: T) => void) {
    const length = this.buffer.push([item, drainFn])
    if (length > this.limit) {
      this.buffer.splice(0, 1)
    }
  }

  drain() {
    this.buffer.forEach(([item, drainFn]) => drainFn(item))
    this.buffer.length = 0
  }
}
