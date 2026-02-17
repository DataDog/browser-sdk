import type { RawRumViewEvent, RawRumViewUpdateEvent } from '../../rawRumEvent.types'
import { RumEventType } from '../../rawRumEvent.types'
import { deepClone, isEmptyObject } from '@datadog/browser-core'

/**
 * Compare two values for deep equality
 */
function isEqual(a: unknown, b: unknown): boolean {
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
interface DiffMergeOptions {
  replaceKeys?: Set<string>
  appendKeys?: Set<string>
}

/**
 * MERGE strategy: compare two objects and return an object with only changed fields.
 * Returns undefined if no changes.
 */
function diffMerge(
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
      const nestedDiff = diffMerge(
        currentVal as Record<string, unknown>,
        lastSentVal as Record<string, unknown>
      )
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

/**
 * Check if the diff has any meaningful changes beyond required fields
 */
function hasChanges(diff: RawRumViewUpdateEvent): boolean {
  // Check if view has any keys
  if (diff.view && Object.keys(diff.view).length > 0) {
    return true
  }

  // Check if _dd has any keys besides document_version
  if (diff._dd) {
    const ddKeys = Object.keys(diff._dd).filter((k) => k !== 'document_version')
    if (ddKeys.length > 0) {
      return true
    }
  }

  // Check if display, privacy, or device is defined
  if (diff.display !== undefined || diff.privacy !== undefined || diff.device !== undefined) {
    return true
  }

  return false
}

/**
 * Compute a minimal diff between two RawRumViewEvent objects.
 * Returns undefined if there are no meaningful changes.
 */
export function computeViewDiff(
  current: RawRumViewEvent,
  lastSent: RawRumViewEvent
): RawRumViewUpdateEvent | undefined {
  const diff: RawRumViewUpdateEvent = {
    date: current.date,
    type: RumEventType.VIEW_UPDATE,
    view: {},
    _dd: { document_version: current._dd.document_version },
  }

  // Diff view.* (MERGE, with custom_timings as REPLACE)
  const viewDiff = diffMerge(
    current.view as Record<string, unknown>,
    lastSent.view as Record<string, unknown>,
    { replaceKeys: new Set(['custom_timings']) }
  )
  if (viewDiff) {
    Object.assign(diff.view, viewDiff)
  }

  // Diff _dd.* (MERGE, with page_states as APPEND)
  const ddDiff = diffMerge(
    current._dd as Record<string, unknown>,
    lastSent._dd as Record<string, unknown>,
    { appendKeys: new Set(['page_states']) }
  )
  if (ddDiff) {
    // Remove document_version from ddDiff (already in required fields)
    delete ddDiff.document_version
    Object.assign(diff._dd, ddDiff)
  }

  // Diff display (MERGE, optional top-level)
  if (current.display && lastSent.display) {
    const displayDiff = diffMerge(
      current.display as unknown as Record<string, unknown>,
      lastSent.display as unknown as Record<string, unknown>
    )
    if (displayDiff) {
      diff.display = displayDiff as RawRumViewUpdateEvent['display']
    }
  } else if (current.display && !lastSent.display) {
    diff.display = current.display
  } else if (!current.display && lastSent.display) {
    // DELETE: field was present, now absent
    diff.display = null as unknown as undefined
  }

  // Diff privacy (REPLACE, optional top-level)
  if (!isEqual(current.privacy, lastSent.privacy)) {
    diff.privacy = current.privacy ?? (null as unknown as undefined)
  }

  // Diff device (REPLACE, optional top-level)
  if (!isEqual(current.device, lastSent.device)) {
    diff.device = current.device ?? (null as unknown as undefined)
  }

  if (!hasChanges(diff)) {
    return undefined
  }

  return diff
}

/**
 * Create a tracker for managing last-sent view state
 */
export function createViewDiffTracker() {
  let lastSentState: RawRumViewEvent | undefined

  return {
    recordSentState(state: RawRumViewEvent) {
      lastSentState = deepClone(state)
    },

    getLastSentState(): RawRumViewEvent | undefined {
      return lastSentState
    },

    reset() {
      lastSentState = undefined
    },
  }
}
