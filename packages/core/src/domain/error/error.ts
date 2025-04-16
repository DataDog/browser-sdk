import { sanitize } from '../../tools/serialisation/sanitize'
import type { ClocksState } from '../../tools/utils/timeUtils'
import type { Context } from '../../tools/serialisation/context'
import { jsonStringify } from '../../tools/serialisation/jsonStringify'
import type { StackTrace } from '../../tools/stackTrace/computeStackTrace'
import { computeStackTrace } from '../../tools/stackTrace/computeStackTrace'
import { toStackTraceString } from '../../tools/stackTrace/handlingStack'
import type { ErrorSource, ErrorHandling, RawError, RawErrorCause, ErrorWithCause, NonErrorPrefix } from './error.types'

export const NO_ERROR_STACK_PRESENT_MESSAGE = 'No stack, consider using an instance of Error'

type RawErrorParams = {
  stackTrace?: StackTrace
  originalError: unknown
  handlingStack?: string
  componentStack?: string
  startClocks: ClocksState
  nonErrorPrefix: NonErrorPrefix
  useFallbackStack?: boolean
  source: ErrorSource
  handling: ErrorHandling
}

export function computeRawError({
  stackTrace,
  originalError,
  handlingStack,
  componentStack,
  startClocks,
  nonErrorPrefix,
  useFallbackStack = true,
  source,
  handling,
}: RawErrorParams): RawError {
  const isErrorInstance = isError(originalError)
  if (!stackTrace && isErrorInstance) {
    stackTrace = computeStackTrace(originalError)
  }

  const message = computeMessage(stackTrace, isErrorInstance, nonErrorPrefix, originalError)
  const causes = isErrorInstance ? flattenErrorCauses(originalError as ErrorWithCause, source) : undefined
  const stack = stackTrace
    ? toStackTraceString(stackTrace)
    : useFallbackStack
      ? NO_ERROR_STACK_PRESENT_MESSAGE
      : undefined
  const type = stackTrace ? stackTrace.name : undefined
  const fingerprint = tryToGetFingerprint(originalError)
  const context = tryToGetErrorContext(originalError)

  return {
    startClocks,
    source,
    handling,
    handlingStack,
    componentStack,
    originalError,
    type,
    message,
    stack,
    causes,
    fingerprint,
    context,
  }
}

function computeMessage(
  stackTrace: StackTrace | undefined,
  isErrorInstance: boolean,
  nonErrorPrefix: NonErrorPrefix,
  originalError: unknown
) {
  // Favor stackTrace message only if tracekit has really been able to extract something meaningful (message + name)
  // TODO rework tracekit integration to avoid scattering error building logic
  return stackTrace?.message && stackTrace?.name
    ? stackTrace.message
    : !isErrorInstance
      ? `${nonErrorPrefix} ${jsonStringify(sanitize(originalError))!}`
      : 'Empty message'
}

export function tryToGetFingerprint(originalError: unknown) {
  return isError(originalError) && 'dd_fingerprint' in originalError ? String(originalError.dd_fingerprint) : undefined
}

export function tryToGetErrorContext(originalError: unknown) {
  if (originalError !== null && typeof originalError === 'object' && 'dd_context' in originalError) {
    return originalError.dd_context as Context
  }
}

export function getFileFromStackTraceString(stack: string) {
  return /@ (.+)/.exec(stack)?.[1]
}

export function isError(error: unknown): error is Error {
  return error instanceof Error || Object.prototype.toString.call(error) === '[object Error]'
}

export function flattenErrorCauses(error: ErrorWithCause, parentSource: ErrorSource): RawErrorCause[] | undefined {
  let currentError = error
  const causes: RawErrorCause[] = []
  while (isError(currentError?.cause) && causes.length < 10) {
    const stackTrace = computeStackTrace(currentError.cause)
    causes.push({
      message: currentError.cause.message,
      source: parentSource,
      type: stackTrace?.name,
      stack: stackTrace && toStackTraceString(stackTrace),
    })
    currentError = currentError.cause
  }
  return causes.length ? causes : undefined
}
