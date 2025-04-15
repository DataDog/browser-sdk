import { isError as _isError, sanitize } from '@datadog/browser-core'
import type { ErrorEvent } from '../domain/event'

const MAX_DEPTH = 10

type RawError = Error & {
  dd_fingerprint?: unknown
  dd_context?: unknown
  cause?: unknown
}

export function serializeError(error: RawError, depth: number = 0) {
  const err: ErrorEvent['error'] = {
    name: error.name,
    stack: error.stack,
    message: error.message,
    fingerprint: sanitize(error.dd_fingerprint),
    context: sanitize(error.dd_context),
  }

  if (error.cause && isError(error.cause) && depth < MAX_DEPTH) {
    err.cause = serializeError(error.cause, depth + 1)
  }

  return err
}

export function isError(error: unknown): error is RawError {
  return _isError(error)
}

export function createHandlingStack() {
  return new Error().stack
}
