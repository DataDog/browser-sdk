/**
 * Template compilation and evaluation utilities for Live Debugger SDK.
 */

import { getConstructorName } from '@datadog/browser-core'
import { compile } from './expression'
import { formatUnknownError } from './error'

const MAX_MESSAGE_LENGTH = 8 * 1024 // 8KB

interface TemplateEvaluationError {
  expr: string
  message: string
}

export interface TemplateSegment {
  str?: string
  dsl?: string
  json?: any
}

// Options for browserInspect - controls how values are stringified
const INSPECT_MAX_ARRAY_LENGTH = 3
const INSPECT_MAX_STRING_LENGTH = 8 * 1024 // 8KB
const INSPECT_MAX_OBJECT_PROPERTIES = 5

/**
 * Check if template segments require runtime evaluation
 *
 * @param segments - Array of segment objects
 * @returns True if segments contain expressions to evaluate
 */
export function templateRequiresEvaluation(segments: TemplateSegment[] | undefined): boolean {
  if (segments === undefined) {
    return false
  }
  for (const { dsl } of segments) {
    if (dsl !== undefined) {
      return true
    }
  }
  return false
}

/**
 * Compile template segments into executable code
 *
 * @param segments - Array of segment objects with str (static) or dsl/json (dynamic)
 * @returns Compiled JavaScript code that returns an array
 */
export function compileSegments(segments: TemplateSegment[]): string {
  let segmentsCode = '['
  for (let i = 0; i < segments.length; i++) {
    const { str, dsl, json } = segments[i]
    segmentsCode +=
      str === undefined
        ? `(() => {
          try {
            const result = ${compile(json)}
            return typeof result === 'string' ? result : $dd_inspect(result)
          } catch (e) {
            return { expr: ${JSON.stringify(dsl)}, message: $dd_format_error(e) }
          }
        })()`
        : JSON.stringify(str)
    if (i !== segments.length - 1) {
      segmentsCode += ','
    }
  }
  segmentsCode += ']'

  // Return the compiled array code (not the function yet - that's done with context)
  return segmentsCode
}

/**
 * Browser-compatible inspect function for template segment evaluation
 *
 * @param value - Value to inspect
 * @returns String representation of the value
 */
// TODO: Should we use a 3rd party library instead of implementing our own?
export function browserInspect(value: unknown): string {
  return browserInspectInternal(value)
}

function browserInspectInternal(value: unknown, depthExceeded: boolean = false): string {
  if (value === null) {
    return 'null'
  }
  if (value === undefined) {
    return 'undefined'
  }

  if (typeof value === 'string') {
    if (value.length > INSPECT_MAX_STRING_LENGTH) {
      return `${value.slice(0, INSPECT_MAX_STRING_LENGTH)}…`
    }
    return value
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (typeof value === 'bigint') {
    return `${value}n`
  }
  if (typeof value === 'symbol') {
    return value.toString()
  }
  if (typeof value === 'function') {
    return `[Function: ${value.name || 'anonymous'}]`
  }

  // Handle arrays
  if (Array.isArray(value)) {
    // Special case: if depth is exceeded AND the array contains arrays, collapse entirely
    if (depthExceeded && value.length > 0 && Array.isArray(value[0])) {
      return '[Array]'
    }

    if (value.length > INSPECT_MAX_ARRAY_LENGTH) {
      const truncated = value.slice(0, INSPECT_MAX_ARRAY_LENGTH)
      const remaining = value.length - INSPECT_MAX_ARRAY_LENGTH
      const items = truncated.map((item) => inspectValueInternal(item, true)).join(',')
      return `[${items}, ... ${remaining} more items]`
    }
    // Recursively inspect array items with increased depth
    const items = value.map((item) => inspectValueInternal(item, true)).join(',')
    return `[${items}]`
  }

  // Handle objects
  if (depthExceeded) {
    return '[Object]'
  }

  try {
    // Undefined when the root toJSON() returns a non-serializable value
    return serializeJson(value, '', []) ?? 'undefined'
  } catch {
    return `[${getConstructorName(value) ?? 'Object'}]`
  }
}

/**
 * Serialize a value following JSON.stringify semantics, with the following limits:
 * - strings are truncated to INSPECT_MAX_STRING_LENGTH
 * - objects are truncated to INSPECT_MAX_OBJECT_PROPERTIES, omitted properties are not read
 *
 * @returns The serialized value, or undefined for non-serializable values (undefined, functions, symbols)
 */
function serializeJson(value: unknown, key: string, ancestors: object[]): string | undefined {
  if ((typeof value === 'object' && value !== null) || typeof value === 'bigint') {
    const toJSON = (value as { toJSON?: unknown }).toJSON
    if (typeof toJSON === 'function') {
      value = toJSON.call(value, key)
    }
  }
  if (typeof value === 'object' && value !== null) {
    value = unboxPrimitive(value)
  }
  switch (typeof value) {
    case 'string':
      return JSON.stringify(
        value.length > INSPECT_MAX_STRING_LENGTH ? `${value.slice(0, INSPECT_MAX_STRING_LENGTH)}…` : value
      )
    case 'number':
      return isFinite(value) ? String(value) : 'null'
    case 'boolean':
      return String(value)
    case 'bigint':
      throw new TypeError('Do not know how to serialize a BigInt')
    case 'object':
      return value === null ? 'null' : serializeJsonObject(value, ancestors)
    default:
      return undefined
  }
}

function serializeJsonObject(value: object, ancestors: object[]): string {
  if (ancestors.includes(value)) {
    throw new TypeError('Converting circular structure to JSON')
  }
  ancestors.push(value)
  let result: string
  if (Array.isArray(value)) {
    const items: string[] = []
    for (let i = 0; i < value.length; i++) {
      items.push(serializeJson(value[i], String(i), ancestors) ?? 'null')
    }
    result = `[${items.join(',')}]`
  } else {
    const keys = Object.keys(value)
    const properties: string[] = []
    for (let i = 0; i < Math.min(keys.length, INSPECT_MAX_OBJECT_PROPERTIES); i++) {
      const serialized = serializeJson((value as Record<string, unknown>)[keys[i]], keys[i], ancestors)
      if (serialized !== undefined) {
        properties.push(`${JSON.stringify(keys[i])}:${serialized}`)
      }
    }
    const omittedCount = keys.length - INSPECT_MAX_OBJECT_PROPERTIES
    if (omittedCount > 0) {
      properties.push(`${properties.length > 0 ? ' ' : ''}... ${omittedCount} more properties`)
    }
    result = `{${properties.join(',')}}`
  }
  ancestors.pop()
  return result
}

/**
 * Unbox String, Number and Boolean objects, regardless of their realm, like JSON.stringify does
 */
function unboxPrimitive(value: object): unknown {
  // The tag is only a hint (it can be overridden with Symbol.toStringTag), valueOf() checks the actual type
  try {
    switch (Object.prototype.toString.call(value)) {
      case '[object String]':
        return String.prototype.valueOf.call(value)
      case '[object Number]':
        return Number.prototype.valueOf.call(value)
      case '[object Boolean]':
        return Boolean.prototype.valueOf.call(value)
    }
  } catch {
    // Not an actual boxed primitive
  }
  return value
}

/**
 * Helper function to inspect a value
 * Used for recursive inspection of array/object elements
 */
function inspectValueInternal(value: unknown, depthExceeded: boolean = false): string {
  if (value === null) {
    return 'null'
  }
  if (value === undefined) {
    return 'undefined'
  }
  if (typeof value === 'string') {
    // For nested strings in arrays, we need to quote them like JSON
    const str = value.length > INSPECT_MAX_STRING_LENGTH ? `${value.slice(0, INSPECT_MAX_STRING_LENGTH)}…` : value
    return JSON.stringify(str)
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (typeof value === 'bigint') {
    return `${value}n`
  }

  // For nested objects/arrays, check depth
  if (depthExceeded) {
    if (Array.isArray(value)) {
      return '[Array]'
    }
    if (typeof value === 'object') {
      return '[Object]'
    }
  }

  // Recursively inspect with browserInspectInternal
  return browserInspectInternal(value, true)
}

export interface ProbeWithTemplate {
  template: string
  evaluateTemplate?: (context: Record<string, any>) => unknown[]
}

/**
 * Evaluate probe message from template and runtime result
 *
 * @param probe - Probe configuration
 * @param context - Runtime execution context
 * @returns Evaluated and truncated message
 */
export function evaluateProbeMessage(probe: ProbeWithTemplate, context: Record<string, any>): string {
  let message: string

  if (probe.evaluateTemplate) {
    try {
      const segments = probe.evaluateTemplate(context)
      message = segments
        .map((seg) => {
          if (typeof seg === 'string') {
            return seg
          } else if (isTemplateEvaluationError(seg)) {
            return `{${seg.message}}`
          }
          return String(seg)
        })
        .join('')
    } catch (e) {
      message = `{${formatUnknownError(e)}}`
    }
  } else {
    message = probe.template
  }

  // Truncate message if it exceeds maximum length
  if (message.length > MAX_MESSAGE_LENGTH) {
    message = `${message.slice(0, MAX_MESSAGE_LENGTH)}…`
  }

  return message
}

function isTemplateEvaluationError(segment: any): segment is TemplateEvaluationError {
  return segment?.expr !== undefined
}
