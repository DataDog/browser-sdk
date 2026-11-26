// Leaf module for error primitives with no further dependencies, so cross-cutting
// modules (e.g. telemetry) can use them without pulling in the whole error module
// and creating import cycles.

import { isIndexableObject } from '@datadog/js-core/util'

export const NO_ERROR_STACK_PRESENT_MESSAGE = 'No stack, consider using an instance of Error'

export function isError(error: unknown): error is Error {
  try {
    return error instanceof Error || Object.prototype.toString.call(error) === '[object Error]'
  } catch {
    return false
  }
}

export function isErrorLike(error: unknown): error is {
  message: string
  name?: string
  stack?: string
} {
  return (
    isIndexableObject(error) &&
    typeof error.message === 'string' &&
    (error.name === undefined || typeof error.name === 'string') &&
    (error.stack === undefined || typeof error.stack === 'string')
  )
}
