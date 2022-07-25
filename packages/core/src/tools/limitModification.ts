import type { Context } from './context'
import { deepClone, getType } from './utils'

/**
 * Current limitation:
 * - field path do not support array, 'a.b.c' only
 */
export function limitModification<T extends Context, Result>(
  object: T,
  modifiableFieldPaths: string[],
  modifier: (object: T) => Result
): Result | undefined {
  const clone = deepClone(object)
  const result = modifier(clone)
  modifiableFieldPaths.forEach((path) => {
    const originalValue = get(object, path)
    const newValue = get(clone, path)
    const originalType = getType(originalValue)
    const newType = getType(newValue)
    if (newType === originalType) {
      set(object, path, newValue)
    } else if (originalType === 'object' && (newType === 'undefined' || newType === 'null')) {
      set(object, path, {})
    }
  })
  return result
}

function get(object: unknown, path: string) {
  let current = object
  for (const field of path.split('.')) {
    if (!isValidObjectContaining(current, field)) {
      return
    }
    current = current[field]
  }
  return current
}

function set(object: unknown, path: string, value: unknown) {
  let current = object
  const fields = path.split('.')
  for (let i = 0; i < fields.length; i += 1) {
    const field = fields[i]
    if (!isValidObjectContaining(current, field)) {
      return
    }
    if (i !== fields.length - 1) {
      current = current[field]
    } else {
      current[field] = value
    }
  }
}

function isValidObjectContaining(object: unknown, field: string): object is { [key: string]: unknown } {
  return typeof object === 'object' && object !== null && Object.prototype.hasOwnProperty.call(object, field)
}
