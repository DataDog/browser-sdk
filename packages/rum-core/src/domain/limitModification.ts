import { sanitize, deepClone, getType, objectEntries } from '@datadog/browser-core'
import type { Context } from '@datadog/browser-core'

export type ModifiableFieldPaths = Record<string, 'string' | 'object'>

/**
 * Allows declaring and enforcing modifications to specific fields of an object.
 * Only supports modifying properties of an object (even if nested in an array).
 * Does not support array manipulation (adding/removing items).
 */
export function limitModification<T extends Context, Result>(
  object: T,
  modifiableFieldPaths: ModifiableFieldPaths,
  modifier: (object: T) => Result
): Result | undefined {
  const clone = deepClone(object)
  const result = modifier(clone)

  // Validate the modified fields and assign them back to 'original' if they match the expected type.
  objectEntries(modifiableFieldPaths).forEach(([fieldPath, fieldType]) => {
    const pathSegments = fieldPath.split('.')
    const newValue = getValueFromPath(clone, pathSegments)
    const newType = getTypes(newValue)

    if (isValidType(newType, fieldType)) {
      setValueAtPath(object, pathSegments, sanitizeValues(newValue))
    } else if (fieldType === 'object' && (newType === 'undefined' || newType === 'null')) {
      setValueAtPath(object, pathSegments, {})
    }
  })

  return result
}

function getValueFromPath(object: unknown, pathSegments: string[]): unknown {
  let [field, ...restPathSegments] = pathSegments // eslint-disable-line prefer-const

  // Handle array-access notation "something[]"
  if (field.endsWith('[]')) {
    field = field.slice(0, -2)

    if (!isValidObjectContaining(object, field) || !Array.isArray(object[field])) {
      return
    }

    return (object[field] as unknown[]).map((item) => getValueFromPath(item, restPathSegments))
  }

  return getNestedValue(object, pathSegments)
}

function getNestedValue(object: unknown, pathSegments: string[]): unknown {
  const [field, ...restPathSegments] = pathSegments

  if (!isValidObjectContaining(object, field)) {
    return
  }

  if (restPathSegments.length === 0) {
    return object[field]
  }

  return getValueFromPath(object[field], restPathSegments)
}

function setValueAtPath(object: unknown, pathSegments: string[], value: unknown) {
  let [field, ...restPathSegments] = pathSegments // eslint-disable-line prefer-const

  // Handle array-access notation "something[]"
  if (field.endsWith('[]')) {
    field = field.slice(0, -2)

    if (!isValidObjectContaining(object, field) || !Array.isArray(object[field]) || !Array.isArray(value)) {
      return
    }

    ;(object[field] as unknown[]).forEach((item, i) => setValueAtPath(item, restPathSegments, value[i]))
    return
  }

  setNestedValue(object, pathSegments, value)
}

function setNestedValue(object: unknown, pathSegments: string[], value: unknown) {
  const [field, ...restPathSegments] = pathSegments

  if (!isValidObject(object)) {
    return
  }

  if (restPathSegments.length === 0) {
    object[field] = value
    return
  }

  setValueAtPath(object[field], restPathSegments, value)
}

function isValidObject(object: unknown): object is Record<string, unknown> {
  return getType(object) === 'object'
}

function isValidObjectContaining(object: unknown, field: string): object is Record<string, unknown> {
  return isValidObject(object) && Object.prototype.hasOwnProperty.call(object, field)
}

function isValidType(actualType: string | string[], expectedType: 'string' | 'object'): boolean {
  if (Array.isArray(actualType)) {
    return actualType.length > 0 && actualType.every((type) => type === expectedType)
  }

  return actualType === expectedType
}

function sanitizeValues(thing: unknown) {
  if (Array.isArray(thing)) {
    return thing.map((item) => sanitize(item))
  }

  return sanitize(thing)
}

function getTypes(thing: unknown) {
  if (Array.isArray(thing)) {
    return thing.map((item) => getType(item))
  }

  return getType(thing)
}
