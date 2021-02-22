import { Context, deepClone } from './context'

/**
 * Current limitations:
 * - field path do not support array, 'a.b.c' only
 * - modifiable fields type must be string
 */
export function limitModification<T extends Context>(
  object: T,
  modifiableFieldPaths: string[],
  modifier: (object: T) => boolean | void
): boolean | void {
  const clone = deepClone(object)
  let result
  try {
    result = modifier(clone)
  } catch (e) {
    console.error(e)
    return
  }
  modifiableFieldPaths.forEach((path) => {
    const originalValue = get(object, path)
    const newValue = get(clone, path)
    if (typeof originalValue === 'string' && typeof newValue === 'string') {
      set(object, path, newValue)
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

function set(object: unknown, path: string, value: string) {
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
  return typeof object === 'object' && object !== null && field in object
}
