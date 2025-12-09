/**
 * Template compilation and evaluation utilities for live debugger
 */

import { compile } from './expression'

const MAX_MESSAGE_LENGTH = 8 * 1024 // 8KB

export interface TemplateSegment {
  str?: string
  dsl?: string
  json?: any
}

export interface CompiledTemplate {
  createFunction: (keys: string[]) => (...args: any[]) => any[]
  clearCache?: () => void
}

// Options for browserInspect - controls how values are stringified
const INSPECT_MAX_ARRAY_LENGTH = 3
const INSPECT_MAX_STRING_LENGTH = 8 * 1024 // 8KB

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
            return { expr: ${JSON.stringify(dsl)}, message: \`\${e.name}: \${e.message}\` }
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
    // Create custom replacer to handle maxStringLength in nested values
    const replacer = (_key: string, val: unknown) => {
      if (typeof val === 'string' && val.length > INSPECT_MAX_STRING_LENGTH) {
        return `${val.slice(0, INSPECT_MAX_STRING_LENGTH)}…`
      }
      return val
    }
    return JSON.stringify(value, replacer, 0)
  } catch {
    return `[${(value as any).constructor?.name || 'Object'}]`
  }
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

/**
 * Evaluate compiled template with runtime context
 *
 * @param compiledTemplate - Template object with createFunction factory
 * @param context - Runtime context with variables
 * @returns Array of segment results (strings or error objects)
 */
function evalCompiledTemplate(compiledTemplate: CompiledTemplate, context: Record<string, any>): any[] {
  // Separate 'this' from other context variables
  const { this: thisValue, ...otherContext } = context
  const contextKeys = Object.keys(otherContext)
  const contextValues = Object.values(otherContext)

  // Create function with dynamic parameters (function body was pre-built during initialization)
  const fn = compiledTemplate.createFunction(contextKeys)

  // Execute with browserInspect and context values, binding 'this' context
  return fn.call(thisValue, browserInspect, ...contextValues)
}

export interface ProbeWithTemplate {
  templateRequiresEvaluation: boolean
  template: CompiledTemplate | string
}

/**
 * Evaluate probe message from template and runtime result
 *
 * @param probe - Probe configuration
 * @param context - Runtime execution context
 * @returns Evaluated and truncated message
 */
export function evaluateProbeMessage(probe: ProbeWithTemplate, context: Record<string, any>): string {
  let message = ''

  if (probe.templateRequiresEvaluation) {
    try {
      const segments = evalCompiledTemplate(probe.template as CompiledTemplate, context)
      message = segments
        .map((seg) => {
          if (typeof seg === 'string') {
            return seg
          } else if (seg && typeof seg === 'object' && seg.expr) {
            // Error object from template evaluation
            return `{${seg.message}}`
          }
          return String(seg)
        })
        .join('')
    } catch (e) {
      message = `{Error: ${(e as Error).message}}`
    }
  } else {
    message = probe.template as string
  }

  // Truncate message if it exceeds maximum length
  if (message.length > MAX_MESSAGE_LENGTH) {
    message = `${message.slice(0, MAX_MESSAGE_LENGTH)}…`
  }

  return message
}
