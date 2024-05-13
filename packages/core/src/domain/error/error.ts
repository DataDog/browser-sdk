import { sanitize } from '../../tools/serialisation/sanitize'
import type { ClocksState } from '../../tools/utils/timeUtils'
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
  startClocks: ClocksState
  nonErrorPrefix: NonErrorPrefix
  source: ErrorSource
  handling: ErrorHandling
}

export function computeRawError({
  stackTrace,
  originalError,
  handlingStack,
  startClocks,
  nonErrorPrefix,
  source,
  handling,
}: RawErrorParams): RawError {
  const isErrorInstance = originalError instanceof Error

  const message = computeMessage(stackTrace, isErrorInstance, nonErrorPrefix, originalError)
  const stack = hasUsableStack(isErrorInstance, stackTrace)
    ? toStackTraceString(stackTrace)
    : NO_ERROR_STACK_PRESENT_MESSAGE
  const causes = isErrorInstance ? flattenErrorCauses(originalError as ErrorWithCause, source) : undefined
  const type = stackTrace?.name
  const fingerprint = tryToGetFingerprint(originalError)

  return {
    startClocks,
    source,
    handling,
    handlingStack,
    originalError,
    type,
    message,
    stack,
    causes,
    fingerprint,
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

function hasUsableStack(isErrorInstance: boolean, stackTrace?: StackTrace): stackTrace is StackTrace {
  if (stackTrace === undefined) {
    return false
  }
  if (isErrorInstance) {
    return true
  }
  // handle cases where tracekit return stack = [] or stack = [{url: undefined, line: undefined, column: undefined}]
  // TODO rework tracekit integration to avoid generating those unusable stack
  return stackTrace.stack.length > 0 && (stackTrace.stack.length > 1 || stackTrace.stack[0].url !== undefined)
}

export function tryToGetFingerprint(originalError: unknown) {
  return originalError instanceof Error && 'dd_fingerprint' in originalError
    ? String(originalError.dd_fingerprint)
    : undefined
}

export function getFileFromStackTraceString(stack: string) {
  return /@ (.+)/.exec(stack)?.[1]
}

export function flattenErrorCauses(error: ErrorWithCause, parentSource: ErrorSource): RawErrorCause[] | undefined {
  let currentError = error
  const causes: RawErrorCause[] = []
  while (currentError?.cause instanceof Error && causes.length < 10) {
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
