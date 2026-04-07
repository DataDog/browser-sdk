import { isIndexableObject } from '@datadog/browser-core'

/**
 * Compare two values for deep equality
 */
export function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true
  }

  if (a === null || typeof a !== 'object' || b === null || typeof b !== 'object') {
    return a === b
  }

  // Arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false
    }
    return a.every((val, idx) => isEqual(val, b[idx]))
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    return false
  }

  // Plain objects
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
  ignoreKeys?: Set<string>
}

/**
 * MERGE strategy: compare two objects and return an object with only changed fields.
 * Returns undefined if no changes.
 *
 * Default strategy is REPLACE (isEqual check). Exceptions:
 * - Both values are plain objects and key is not in replaceKeys: recurse (MERGE)
 *   Sub-paths (e.g. 'view.custom_timings') are propagated to the recursive call.
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
  const ignoreKeys = options?.ignoreKeys ?? new Set<string>()

  for (const key of Object.keys(current)) {
    if (ignoreKeys.has(key)) {
      continue
    }

    const currentVal = current[key]
    const lastSentVal = lastSent[key]

    if (!replaceKeys.has(key) && isIndexableObject(currentVal) && isIndexableObject(lastSentVal)) {
      // Both are plain objects and not marked for replace: recurse (MERGE)
      const nestedDiff = diffMerge(currentVal, lastSentVal, {
        replaceKeys: extractSubPaths(replaceKeys, key),
        appendKeys: extractSubPaths(appendKeys, key),
        ignoreKeys: extractSubPaths(ignoreKeys, key),
      })
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

function extractSubPaths(keys: Set<string>, prefix: string): Set<string> {
  const result = new Set<string>()
  for (const key of keys) {
    if (key.startsWith(`${prefix}.`)) {
      result.add(key.slice(prefix.length + 1))
    }
  }
  return result
}
