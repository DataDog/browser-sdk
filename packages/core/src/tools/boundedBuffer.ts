import { removeItem } from './utils/arrayUtils'

const BUFFER_LIMIT = 500

export interface BoundedBuffer<T = void> {
  add: (callback: (arg: T) => void) => void
  remove: (callback: (arg: T) => void) => void
  drain: (arg: T) => void
}

export function boundedBuffer<T = void>(): BoundedBuffer<T> {
  const buffer: Array<(arg: T) => void> = []

  function add(callback: (arg: T) => void) {
    const length = buffer.push(callback)
    if (length > BUFFER_LIMIT) {
      buffer.splice(0, 1)
    }
  }

  function remove(callback: (arg: T) => void) {
    removeItem(buffer, callback)
  }

  function drain(arg: T) {
    buffer.forEach((callback) => callback(arg))
    buffer.length = 0
  }

  return {
    add,
    remove,
    drain,
  }
}
