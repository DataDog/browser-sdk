/**
 * Template compilation and evaluation utilities for live debugger
 */

import { compile } from './expression.js'

const MAX_MESSAGE_LENGTH = 8 * 1024 // 8KB

/**
 * Check if template segments require runtime evaluation
 * @param {Array} segments - Array of segment objects
 * @returns {boolean} - True if segments contain expressions to evaluate
 */
export function templateRequiresEvaluation (segments) {
  if (segments === undefined) return false
  for (const { dsl } of segments) {
    if (dsl !== undefined) return true
  }
  return false
}

/**
 * Compile template segments into executable code
 * @param {Array} segments - Array of segment objects with str (static) or dsl/json (dynamic)
 * @returns {string} - Compiled JavaScript code that returns an array
 */
export function compileSegments (segments) {
  let segmentsCode = '['
  for (let i = 0; i < segments.length; i++) {
    const { str, dsl, json } = segments[i]
    segmentsCode += str === undefined
      ? `(() => {
          try {
            const result = ${compile(json)}
            return typeof result === 'string' ? result : $dd_inspect(result, $dd_segmentInspectOptions)
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
 */
function browserInspect (value, options) {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value === 'bigint') return `${value}n`
  if (typeof value === 'symbol') return value.toString()
  if (typeof value === 'function') return `[Function: ${value.name || 'anonymous'}]`

  try {
    // For objects and arrays, use JSON.stringify with some sensible defaults
    return JSON.stringify(value, null, 0)
  } catch (e) {
    return `[${value.constructor?.name || 'Object'}]`
  }
}

/**
 * Evaluate compiled template with runtime context
 * @param {Object} compiledTemplate - Template object with createFunction factory
 * @param {Object} context - Runtime context with variables
 * @returns {Array} - Array of segment results (strings or error objects)
 */
function evalCompiledTemplate (compiledTemplate, context) {
  // Extract context variables for template evaluation
  const contextKeys = Object.keys(context)
  const contextValues = contextKeys.map(key => context[key])

  // Create function with dynamic parameters (function body was pre-built during initialization)
  const fn = compiledTemplate.createFunction(contextKeys)

  // Execute with browserInspect and context values
  return fn(browserInspect, ...contextValues)
}

/**
 * Evaluate probe message from template and runtime result
 * @param {Object} probe - Probe configuration
 * @param {Object} context - Runtime execution context
 * @returns {string} - Evaluated and truncated message
 */
export function evaluateProbeMessage (probe, context) {
  let message = ''

  if (probe.templateRequiresEvaluation) {
    try {
      const segments = evalCompiledTemplate(probe.template, context)
      message = segments.map(seg => {
        if (typeof seg === 'string') {
          return seg
        } else if (seg && typeof seg === 'object' && seg.expr) {
          // Error object from template evaluation
          return `{${seg.message}}`
        } else {
          return String(seg)
        }
      }).join('')
    } catch (e) {
      message = `{Error: ${e.message}}`
    }
  } else {
    message = probe.template
  }

  // Truncate message if it exceeds maximum length
  if (message.length > MAX_MESSAGE_LENGTH) {
    message = message.slice(0, MAX_MESSAGE_LENGTH) + '…'
  }

  return message
}
