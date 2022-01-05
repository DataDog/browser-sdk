const BUFFER_LIMIT = 500

export class BoundedBuffer {
  private buffer: Array<() => void> = []

  add(callback: () => void) {
    const length = this.buffer.push(callback)
    if (length > BUFFER_LIMIT) {
      this.buffer.splice(0, 1)
    }
  }

  drain() {
    this.buffer.forEach((callback) => callback())
    this.buffer.length = 0
  }
}
