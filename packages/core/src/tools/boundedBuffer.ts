const BUFFER_LIMIT = 500

export class BoundedBuffer<T = void> {
  private buffer: Array<(arg: T) => void> = []

  add(callback: (arg: T) => void) {
    const length = this.buffer.push(callback)
    if (length > BUFFER_LIMIT) {
      this.buffer.splice(0, 1)
    }
  }

  remove(callback: (arg: T) => void) {
    const index = this.buffer.indexOf(callback)
    if (index !== -1) {
      this.buffer.splice(index, 1)
    }
  }

  drain(arg: T) {
    this.buffer.forEach((callback) => callback(arg))
    this.buffer.length = 0
  }
}
