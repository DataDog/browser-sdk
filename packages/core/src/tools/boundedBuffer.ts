import { removeItem } from './utils/arrayUtils'

const BUFFER_LIMIT = 500

/**
 * @deprecated Use `BufferedObservable` instead.
 */
export interface BoundedBuffer<T = void> {
  add: (callback: (arg: T) => void) => void
  remove: (callback: (arg: T) => void) => void
  drain: (arg: T) => void
}

/**
 * @deprecated Use `BufferedObservable` instead.
 */
export function createBoundedBuffer<T = void>(): BoundedBuffer<T> {
  const buffer: Array<(arg: T) => void> = []

  const add: BoundedBuffer<T>['add'] = (callback: (arg: T) => void) => {
    const length = buffer.push(callback)
    if (length > BUFFER_LIMIT) {
      buffer.splice(0, 1)
    }
  }

  const remove: BoundedBuffer<T>['remove'] = (callback: (arg: T) => void) => {
    removeItem(buffer, callback)
  }

  const drain = (arg: T) => {
    buffer.forEach((callback) => callback(arg))
    buffer.length = 0
  }

  return {
    add,
    remove,
    drain,
  }
}
