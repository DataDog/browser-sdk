import { isEmptyObject } from '@datadog/browser-core'

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
 */
export function diffMerge(
  current: Record<string, unknown>,
  lastSent: Record<string, unknown>,
  options?: DiffMergeOptions
): Record<string, unknown> | undefined {
  const result: Record<string, unknown> = {}
  const replaceKeys = options?.replaceKeys || new Set<string>()
  const appendKeys = options?.appendKeys || new Set<string>()

  // Check all keys in current
  for (const key of Object.keys(current)) {
    const currentVal = current[key]
    const lastSentVal = lastSent[key]

    // REPLACE strategy for specific keys
    if (replaceKeys.has(key)) {
      if (!isEqual(currentVal, lastSentVal)) {
        result[key] = currentVal
      }
      continue
    }

    // APPEND strategy for array keys
    if (appendKeys.has(key)) {
      if (Array.isArray(currentVal) && Array.isArray(lastSentVal)) {
        if (currentVal.length > lastSentVal.length) {
          // Include only new trailing elements
          result[key] = currentVal.slice(lastSentVal.length)
        }
      } else if (Array.isArray(currentVal) && !lastSentVal) {
        // Array appeared for the first time
        result[key] = currentVal
      }
      continue
    }

    // Primitive comparison
    if (currentVal !== null && typeof currentVal !== 'object') {
      if (currentVal !== lastSentVal) {
        result[key] = currentVal
      }
      continue
    }

    // Handle null explicitly
    if (currentVal === null) {
      if (currentVal !== lastSentVal) {
        result[key] = currentVal
      }
      continue
    }

    // Array comparison (not in appendKeys)
    if (Array.isArray(currentVal)) {
      if (!isEqual(currentVal, lastSentVal)) {
        result[key] = currentVal
      }
      continue
    }

    // Object comparison - recurse (no options propagation: replaceKeys/appendKeys apply only at top level)
    if (typeof currentVal === 'object' && lastSentVal && typeof lastSentVal === 'object') {
      const nestedDiff = diffMerge(currentVal as Record<string, unknown>, lastSentVal as Record<string, unknown>)
      if (nestedDiff && !isEmptyObject(nestedDiff)) {
        result[key] = nestedDiff
      }
    } else if (typeof currentVal === 'object' && !lastSentVal) {
      // New object appeared
      result[key] = currentVal
    }
  }

  // Check for deleted keys (present in lastSent but not in current)
  for (const key of Object.keys(lastSent)) {
    if (!(key in current)) {
      result[key] = null
    }
  }

  return Object.keys(result).length > 0 ? result : undefined
}


