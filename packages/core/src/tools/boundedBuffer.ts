const DEFAULT_LIMIT = 10_000

export class BoundedBuffer {
  private buffer: Array<() => void> = []

  constructor(private limit: number = DEFAULT_LIMIT) {}

  add(callback: () => void) {
    const length = this.buffer.push(callback)
    if (length > this.limit) {
      this.buffer.splice(0, 1)
    }
  }

  drain() {
    this.buffer.forEach((callback) => callback())
    this.buffer.length = 0
  }
}
