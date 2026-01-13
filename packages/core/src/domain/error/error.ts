import { sanitize } from '../../tools/serialisation/sanitize'
import type { ClocksState } from '../../tools/utils/timeUtils'
import type { Context } from '../../tools/serialisation/context'
import { jsonStringify } from '../../tools/serialisation/jsonStringify'
import type { StackTrace } from '../../tools/stackTrace/computeStackTrace'
import { computeStackTrace } from '../../tools/stackTrace/computeStackTrace'
import { toStackTraceString } from '../../tools/stackTrace/handlingStack'
import { isIndexableObject } from '../../tools/utils/typeUtils'
import type { ErrorSource, ErrorHandling, RawError, RawErrorCause, ErrorWithCause, NonErrorPrefix } from './error.types'

export const NO_ERROR_STACK_PRESENT_MESSAGE = 'No stack, consider using an instance of Error'

interface RawErrorParams {
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

function computeErrorBase({
  originalError,
  stackTrace,
  source,
  useFallbackStack = true,
  nonErrorPrefix,
}: {
  originalError: unknown
  stackTrace?: StackTrace
  source: ErrorSource
  useFallbackStack?: boolean
  nonErrorPrefix?: NonErrorPrefix
}) {
  const isErrorInstance = isError(originalError)
  if (!stackTrace && isErrorInstance) {
    stackTrace = computeStackTrace(originalError)
  }

  return {
    source,
    type: stackTrace ? stackTrace.name : undefined,
    message: computeMessage(stackTrace, isErrorInstance, nonErrorPrefix, originalError),
    stack: stackTrace ? toStackTraceString(stackTrace) : useFallbackStack ? NO_ERROR_STACK_PRESENT_MESSAGE : undefined,
  }
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
  const errorBase = computeErrorBase({ originalError, stackTrace, source, useFallbackStack, nonErrorPrefix })

  return {
    startClocks,
    handling,
    handlingStack,
    componentStack,
    originalError,
    ...errorBase,
    causes: isError(originalError) ? flattenErrorCauses(originalError as ErrorWithCause, source) : undefined,
    fingerprint: tryToGetFingerprint(originalError),
    context: tryToGetErrorContext(originalError),
  }
}

function computeMessage(
  stackTrace: StackTrace | undefined,
  isErrorInstance: boolean,
  nonErrorPrefix: NonErrorPrefix | undefined,
  originalError: unknown
) {
  // Favor stackTrace message only if tracekit has really been able to extract something meaningful (message + name)
  // TODO rework tracekit integration to avoid scattering error building logic
  return stackTrace?.message && stackTrace?.name
    ? stackTrace.message
    : !isErrorInstance
      ? nonErrorPrefix
        ? `${nonErrorPrefix} ${jsonStringify(sanitize(originalError))!}`
        : jsonStringify(sanitize(originalError))!
      : 'Empty message'
}

export function tryToGetFingerprint(originalError: unknown) {
  return isError(originalError) && 'dd_fingerprint' in originalError ? String(originalError.dd_fingerprint) : undefined
}

export function tryToGetErrorContext(originalError: unknown) {
  if (isIndexableObject(originalError)) {
    return originalError.dd_context as Context | undefined
  }
}

export function getFileFromStackTraceString(stack: string) {
  return /@ (.+)/.exec(stack)?.[1]
}

export function isError(error: unknown): error is Error {
  return error instanceof Error || Object.prototype.toString.call(error) === '[object Error]'
}

export function flattenErrorCauses(error: ErrorWithCause, parentSource: ErrorSource): RawErrorCause[] | undefined {
  const causes: RawErrorCause[] = []
  let currentCause = error.cause

  while (currentCause !== undefined && currentCause !== null && causes.length < 10) {
    const causeBase = computeErrorBase({
      originalError: currentCause,
      source: parentSource,
      useFallbackStack: false,
    })

    causes.push(causeBase)

    currentCause = isError(currentCause) ? (currentCause as ErrorWithCause).cause : undefined
  }

  return causes.length ? causes : undefined
}
