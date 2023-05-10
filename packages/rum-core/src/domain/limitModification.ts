import { sanitize, deepClone, getType, objectEntries } from '@datadog/browser-core'
import type { Context } from '@datadog/browser-core'

export type ModifiableFieldPaths = Record<string, 'string' | 'object'>

/**
 * Current limitation:
 * - field path do not support array, 'a.b.c' only
 */
export function limitModification<T extends Context, Result>(
  object: T,
  modifiableFieldPaths: ModifiableFieldPaths,
  modifier: (object: T) => Result
): Result | undefined {
  const clone = deepClone(object)
  const result = modifier(clone)
  objectEntries(modifiableFieldPaths).forEach(([fieldPath, fieldType]) => {
    const newValue = get(clone, fieldPath)
    const newType = getType(newValue)
    if (newType === fieldType) {
      set(object, fieldPath, sanitize(newValue))
    } else if (fieldType === 'object' && (newType === 'undefined' || newType === 'null')) {
      set(object, fieldPath, {})
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
    if (!isValidObject(current)) {
      return
    }
    if (i !== fields.length - 1) {
      current = current[field]
    } else {
      current[field] = value
    }
  }
}

function isValidObject(object: unknown): object is Record<string, unknown> {
  return getType(object) === 'object'
}

function isValidObjectContaining(object: unknown, field: string): object is Record<string, unknown> {
  return isValidObject(object) && Object.prototype.hasOwnProperty.call(object, field)
}
