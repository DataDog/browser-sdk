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
  return parseStackTrace(error, skipFrames)
}

/**
 * Parse a stack trace from an Error object
 *
 * @param error - Error object with stack property
 * @param skipFrames - Number of frames to skip from the top of the stack (default: 0)
 * @returns Array of stack frames
 */
export function parseStackTrace(error: Error, skipFrames = 0): StackFrame[] {
  const stack: StackFrame[] = []
  if (!error.stack) {
    return stack
  }
  const stackLines = error.stack.split('\n')

  // Skip the first line (error message), the captureStackTrace frame, and any additional frames to skip
  for (let i = 2 + skipFrames; i < stackLines.length; i++) {
    const line = stackLines[i].trim()

    // Match various stack frame formats:
    // Chrome/V8: "at functionName (file:line:column)" or "at file:line:column"
    // Firefox: "functionName@file:line:column"
    const chromeMatch = line.match(/at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?/)
    const firefoxMatch = line.match(/(.+?)@(.+?):(\d+):(\d+)/)

    const match = chromeMatch || firefoxMatch
    if (match) {
      const functionName = match[1] || ''
      const fileName = match[2]
      const lineNumber = parseInt(match[3], 10)
      const columnNumber = parseInt(match[4], 10)

      stack.push({
        fileName: fileName.trim(),
        function: functionName.trim(),
        lineNumber,
        columnNumber,
      })
    }
  }

  return stack
}
