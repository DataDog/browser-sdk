import type { ClocksState } from '@datadog/js-core/time'
import { isIndexableObject, jsonStringify } from '@datadog/js-core/util'
import { sanitize } from '../../tools/serialisation/sanitize'
import type { Context } from '../../tools/serialisation/context'
import type { StackTrace } from '../../tools/stackTrace/computeStackTrace'
import { computeStackTrace } from '../../tools/stackTrace/computeStackTrace'
import { toStackTraceString } from '../../tools/stackTrace/handlingStack'
import { buildDebugIdByUrl } from '../sourceCodeContext'
import type { ErrorSource, ErrorHandling, RawError, ErrorWithCause, NonErrorPrefix } from './error.types'
import { isError, NO_ERROR_STACK_PRESENT_MESSAGE } from './isError'

export { isError, NO_ERROR_STACK_PRESENT_MESSAGE }

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
  return {
    source,
    type: stackTrace ? stackTrace.name : undefined,
    message: computeMessage(stackTrace, isErrorInstance, nonErrorPrefix, originalError),
    stack: stackTrace ? toStackTraceString(stackTrace) : useFallbackStack ? NO_ERROR_STACK_PRESENT_MESSAGE : undefined,
  }
}

function getStackTraceUrls(stackTrace: StackTrace | undefined): string[] {
  return stackTrace?.stack.map((frame) => frame.url).filter((url): url is string => !!url) ?? []
}

function getErrorDebugIds(
  stackTrace: StackTrace | undefined,
  errorCauses: Array<{ stackTrace: StackTrace | undefined }>
) {
  const errorCausesUrls = errorCauses.flatMap(({ stackTrace }) => getStackTraceUrls(stackTrace))
  return buildDebugIdByUrl(getStackTraceUrls(stackTrace).concat(errorCausesUrls))
}

export function flattenErrorCauses(
  error: ErrorWithCause
): Array<{ originalError: unknown; stackTrace: StackTrace | undefined }> {
  const chain: Array<{ originalError: unknown; stackTrace: StackTrace | undefined }> = []
  let current: unknown = error.cause

  while (current !== undefined && current !== null && chain.length < 10) {
    const isCurrentError = isError(current)
    const stackTrace = isCurrentError ? computeStackTrace(current) : undefined
    chain.push({ originalError: current, stackTrace })
    current = isCurrentError ? (current as ErrorWithCause).cause : undefined
  }

  return chain
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
  const errorStackTrace = stackTrace ?? (isError(originalError) ? computeStackTrace(originalError) : undefined)

  const errorCauses = isError(originalError) ? flattenErrorCauses(originalError) : []

  const errorBase = computeErrorBase({
    originalError,
    stackTrace: errorStackTrace,
    source,
    useFallbackStack,
    nonErrorPrefix,
  })

  const rawErrorCauses = errorCauses.map(({ originalError, stackTrace }) =>
    computeErrorBase({ originalError, stackTrace, source, useFallbackStack: false })
  )

  return {
    startClocks,
    handling,
    handlingStack,
    componentStack,
    originalError,
    ...errorBase,
    debugIds: getErrorDebugIds(errorStackTrace, errorCauses),
    causes: rawErrorCauses.length ? rawErrorCauses : undefined,
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
