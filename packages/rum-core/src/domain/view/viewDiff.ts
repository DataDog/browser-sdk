/**
 * Compare two values for deep equality
 */
export function isEqual(a: unknown, b: unknown): boolean {
  // Reference equality
  if (a === b) {
    return true
  }

  // Handle null/undefined
  if (a === null || b === null || a === undefined || b === undefined) {
    return a === b
  }

  // Type mismatch
  if (typeof a !== typeof b) {
    return false
  }

  // Primitives
  if (typeof a !== 'object') {
    return a === b
  }

  // Arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false
    }
    return a.every((val, idx) => isEqual(val, b[idx]))
  }

  // One is array, other is not
  if (Array.isArray(a) || Array.isArray(b)) {
    return false
  }

  // Objects
  const aObj = a as Record<string, unknown>
  const bObj = b as Record<string, unknown>
  const aKeys = Object.keys(aObj)
  const bKeys = Object.keys(bObj)

  if (aKeys.length !== bKeys.length) {
    return false
  }

  return aKeys.every((key) => bKeys.includes(key) && isEqual(aObj[key], bObj[key]))
}

/**
 * Options for controlling diff merge behavior
 */
export interface DiffMergeOptions {
  replaceKeys?: Set<string>
  appendKeys?: Set<string>
}

/**
 * MERGE strategy: compare two objects and return an object with only changed fields.
 * Returns undefined if no changes.
 *
 * Default strategy is REPLACE (isEqual check). Exceptions:
 * - Both values are plain objects and key is not in replaceKeys: recurse (MERGE)
 * - Both values are arrays and key is in appendKeys: include only new trailing elements (APPEND)
 */
export function diffMerge(
  current: Record<string, unknown>,
  lastSent: Record<string, unknown>,
  options?: DiffMergeOptions
): Record<string, unknown> | undefined {
  const result: Record<string, unknown> = {}
  const replaceKeys = options?.replaceKeys ?? new Set<string>()
  const appendKeys = options?.appendKeys ?? new Set<string>()

  for (const key of Object.keys(current)) {
    const currentVal = current[key]
    const lastSentVal = lastSent[key]

    if (
      !replaceKeys.has(key) &&
      currentVal !== null &&
      typeof currentVal === 'object' &&
      !Array.isArray(currentVal) &&
      lastSentVal !== null &&
      typeof lastSentVal === 'object' &&
      !Array.isArray(lastSentVal)
    ) {
      // Both are plain objects and not marked for replace: recurse (MERGE)
      const nestedDiff = diffMerge(currentVal as Record<string, unknown>, lastSentVal as Record<string, unknown>)
      if (nestedDiff) {
        result[key] = nestedDiff
      }
    } else if (appendKeys.has(key) && Array.isArray(currentVal) && Array.isArray(lastSentVal)) {
      // Array in appendKeys: include only new trailing elements (APPEND)
      if (currentVal.length > lastSentVal.length) {
        result[key] = currentVal.slice(lastSentVal.length)
      }
    } else if (!isEqual(currentVal, lastSentVal)) {
      // Default: replace the whole value (REPLACE)
      result[key] = currentVal
    }
  }

  // Deleted keys: present in lastSent but not in current
  for (const key of Object.keys(lastSent)) {
    if (!(key in current)) {
      result[key] = null
    }
  }

  return Object.keys(result).length > 0 ? result : undefined
}
