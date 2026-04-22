import type { StackTrace } from '@datadog/browser-core'
import { computeStackTrace } from '@datadog/browser-core'

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- `type` is needed for implicit index signature compatibility with Context
export type StackFrame = {
  fileName: string
  function: string
  lineNumber: number
  columnNumber: number
}

/**
 * Capture the current stack trace
 *
 * @param skipFrames - Number of frames to skip from the top of the stack (default: 0)
 * @returns Array of stack frames
 */
export function captureStackTrace(skipFrames = 0): StackFrame[] {
  const error = new Error()
  const stackTrace = computeStackTrace(error)

  // Skip this helper itself so callers get their own frame first.
  return mapStackFrames(stackTrace.stack, 1 + skipFrames)
}

/**
 * Parse a stack trace from an Error object
 *
 * @param error - Error object with stack property
 * @param skipFrames - Number of frames to skip from the top of the parsed stack (default: 0)
 * @returns Array of stack frames
 */
export function parseStackTrace(error: Error, skipFrames = 0): StackFrame[] {
  return mapStackFrames(computeStackTrace(error).stack, skipFrames)
}

function mapStackFrame(frame: StackTrace['stack'][number]): StackFrame | undefined {
  if (!frame.url || frame.line === undefined || frame.column === undefined) {
    return
  }

  return {
    fileName: frame.url.trim(),
    function: frame.func === '?' || !frame.func ? '' : frame.func.trim(),
    lineNumber: frame.line,
    columnNumber: frame.column,
  }
}

function mapStackFrames(stack: StackTrace['stack'], skipFrames = 0): StackFrame[] {
  return stack.reduce<StackFrame[]>((result, frame, index) => {
    if (index < skipFrames) {
      return result
    }

    const mappedFrame = mapStackFrame(frame)
    if (mappedFrame) {
      result.push(mappedFrame)
    }

    return result
  }, [])
}
