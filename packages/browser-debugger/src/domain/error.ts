import { isError, safeStringify, safeToString } from '@datadog/browser-core'
import type { StackFrame } from './stacktrace'
import { parseStackTrace } from './stacktrace'

const UNABLE_TO_STRINGIFY_ERROR = '<error: unable to stringify error>'
const UNABLE_TO_STRINGIFY_THROWN_VALUE = '<error: unable to stringify thrown value>'

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- `type` is needed for implicit index signature compatibility with Context
export type Throwable = {
  message: string
  stacktrace: StackFrame[]
}

/**
 * Format an arbitrary thrown value into a `Throwable` (message + stacktrace) for a debugger
 * snapshot. Tolerates non-`Error` values, cross-realm Errors, and hostile getters without throwing.
 */
export function formatThrowable(error: unknown): Throwable {
  if (isError(error)) {
    return {
      message: formatErrorMessage(error),
      stacktrace: tryParseStackTrace(error),
    }
  }

  return {
    message: formatNonErrorMessage(error),
    stacktrace: [],
  }
}

/**
 * Format an arbitrary thrown value into a single displayable string (e.g. `"TypeError: boom"`),
 * used for condition and template evaluation errors. Never throws.
 */
export function formatUnknownError(error: unknown): string {
  if (!isError(error)) {
    return safeToString(error) ?? UNABLE_TO_STRINGIFY_ERROR
  }

  const name = safeReadErrorProperty(error, 'name')
  const message = safeReadErrorProperty(error, 'message')
  if (name !== undefined && message !== undefined) {
    return `${name}: ${message}`
  }
  return safeToString(error) ?? UNABLE_TO_STRINGIFY_ERROR
}

/**
 * Safely read a string property from an `Error`. Returns `undefined` when the property is not a
 * string or when accessing it throws (e.g. a hostile getter).
 */
export function safeReadErrorProperty(error: Error, property: 'name' | 'message'): string | undefined {
  try {
    const value = error[property]
    return typeof value === 'string' ? value : undefined
  } catch {
    // ignore
  }
}

function tryParseStackTrace(error: Error): Throwable['stacktrace'] {
  try {
    return parseStackTrace(error)
  } catch {
    return []
  }
}

function formatErrorMessage(error: Error): string {
  return (
    safeReadErrorProperty(error, 'message') ??
    safeToString(error) ??
    safeStringify(error) ??
    UNABLE_TO_STRINGIFY_THROWN_VALUE
  )
}

function formatNonErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error
  }

  return safeToString(error) ?? safeStringify(error) ?? UNABLE_TO_STRINGIFY_THROWN_VALUE
}
