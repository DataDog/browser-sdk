import { sanitize, deepClone, getType, objectEntries } from '@datadog/browser-core'
import type { Context } from '@datadog/browser-core'

export type ModifiableFieldPaths = Record<string, 'string' | 'object'>

/**
 * Allows declaring and enforcing modifications to specific fields of an object.
 * Only supports modifying properties of an object (even if nested in an array).
 * Does not support array manipulation (adding/removing items).
 *
 * Modifications of the object are sanitized only if the field was actually changed by the modifier function (i.e., value is different).
 * This ensures consistent SDK behavior regardless of whether limitModification is called.
 * Only string fields are handled this way, object fields are sanitized regardless of whether the modifier function was called or not.
 */
export function limitModification<T extends Context, Result>(
  object: T,
  modifiableFieldPaths: ModifiableFieldPaths,
  modifier: (object: T) => Result
): Result | undefined {
  const clone = deepClone(object)
  const result = modifier(clone)

  objectEntries(modifiableFieldPaths).forEach(([fieldPath, fieldType]) =>
    // Traverse both object and clone simultaneously up to the path and apply the modification from the clone to the original object when the type is valid
    setValueAtPath(object, clone, fieldPath.split(/\.|(?=\[\])/), fieldType)
  )

  return result
}

function setValueAtPath(object: unknown, clone: unknown, pathSegments: string[], fieldType: 'string' | 'object') {
  const [field, ...restPathSegments] = pathSegments

  if (field === '[]') {
    if (Array.isArray(object) && Array.isArray(clone)) {
      object.forEach((item, i) => setValueAtPath(item, clone[i], restPathSegments, fieldType))
    }

    return
  }

  if (!isValidObject(object) || !isValidObject(clone)) {
    return
  }

  if (restPathSegments.length > 0) {
    return setValueAtPath(object[field], clone[field], restPathSegments, fieldType)
  }

  setNestedValue(object, field, clone[field], fieldType)
}

function setNestedValue(
  object: Record<string, unknown>,
  field: string,
  value: unknown,
  fieldType: 'string' | 'object'
) {
  if (object[field] === value) {
    return
  }

  const newType = getType(value)

  if (newType === fieldType) {
    object[field] = sanitize(value)
  } else if (fieldType === 'object' && (newType === 'undefined' || newType === 'null')) {
    object[field] = {}
  }
}

function isValidObject(object: unknown): object is Record<string, unknown> {
  return getType(object) === 'object'
}
