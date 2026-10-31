import { computeStackTraceFromOnErrorMessage } from '../../tools/stackTrace/computeStackTrace'
import { computeRawError, isError } from './error'
import { ErrorHandling, ErrorSource, NonErrorPrefix } from './error.types'
import type { RuntimeError } from './trackRuntimeError'

/** Normalize both buffered and live browser errors in the consuming SDK. */
export function computeRuntimeError({ originalError, startClocks, onError }: RuntimeError) {
  return computeRawError({
    originalError,
    startClocks,
    stackTrace:
      onError && !isError(originalError)
        ? computeStackTraceFromOnErrorMessage(onError.message, onError.url, onError.line, onError.column)
        : undefined,
    nonErrorPrefix: NonErrorPrefix.UNCAUGHT,
    source: ErrorSource.SOURCE,
    handling: ErrorHandling.UNHANDLED,
  })
}
