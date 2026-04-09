import type { StackFrame, StackTrace } from './index'

const UNKNOWN_FUNCTION = '?'

/**
 * Parses an Error into a structured StackTrace with individual frames.
 *
 * Supports Chrome, Firefox, Safari, and IE stack formats.
 */
function computeStackTrace(ex: unknown): StackTrace {
  const stack: StackFrame[] = []

  let stackProperty = tryToGetString(ex, 'stack')
  const exString = String(ex)

  // Remove the error message prefix from the stack if present
  if (stackProperty && stackProperty.startsWith(exString)) {
    stackProperty = stackProperty.slice(exString.length)
  }

  if (stackProperty) {
    for (const line of stackProperty.split('\n')) {
      const frame =
        parseChromeLine(line) || parseChromeAnonymousLine(line) || parseWinLine(line) || parseGeckoLine(line)
      if (frame) {
        if (!frame.func && frame.line) {
          frame.func = UNKNOWN_FUNCTION
        }
        stack.push(frame)
      }
    }
  }

  return {
    message: tryToGetString(ex, 'message'),
    name: tryToGetString(ex, 'name'),
    stack,
  }
}

// Chrome 27+, Edge, Node.js
// "  at functionName (file.js:10:20)"
// "  at file.js:10:20"
const CHROME_RE =
  /^\s*at (.*?) ?\(((?:file|https?|blob|chrome-extension|electron|native|eval|webpack|snippet|<anonymous>|\w+\.|\/|\[).*?)(?::(\d+))?(?::(\d+))?\)?\s*$/
const CHROME_EVAL_RE = /\((\S*)(?::(\d+))(?::(\d+))\)/

function parseChromeLine(line: string): StackFrame | undefined {
  const match = CHROME_RE.exec(line)
  if (!match) return undefined

  const isNative = match[2] && match[2].indexOf('native') === 0
  const isEval = match[2] && match[2].indexOf('eval') === 0
  const evalMatch = isEval ? CHROME_EVAL_RE.exec(match[2]) : undefined

  return {
    func: match[1] || UNKNOWN_FUNCTION,
    url: isNative ? undefined : (evalMatch?.[1] ?? match[2]),
    args: isNative ? ['native'] : [],
    line: evalMatch ? +evalMatch[2] : +match[3] || undefined,
    column: evalMatch ? +evalMatch[3] : +match[4] || undefined,
  }
}

// Chrome anonymous/@ syntax
const CHROME_ANON_RE =
  /^\s*at\s*(?:(?:(.*?)?(?: @))?\s*((?:file|https?|blob|chrome-extension|electron|native|eval|webpack|snippet|<anonymous>|\w+\.|\/|\[).*?)(?::(\d+))?(?::(\d+))?)?\s*$/

function parseChromeAnonymousLine(line: string): StackFrame | undefined {
  const match = CHROME_ANON_RE.exec(line)
  if (!match) return undefined

  return {
    func: match[1] || UNKNOWN_FUNCTION,
    url: match[2],
    line: +match[3] || undefined,
    column: +match[4] || undefined,
  }
}

// IE 10+, Edge (legacy)
const WIN_RE =
  /^\s*at (?:((?:\[object object\])?.+) )?\(?((?:file|ms-appx|https?|webpack|blob):.*?):(\d+)(?::(\d+))?\)?\s*$/i

function parseWinLine(line: string): StackFrame | undefined {
  const match = WIN_RE.exec(line)
  if (!match) return undefined

  return {
    func: match[1] || UNKNOWN_FUNCTION,
    url: match[2],
    line: +match[3] || undefined,
    column: +match[4] || undefined,
  }
}

// Firefox, Safari
const GECKO_RE =
  /^\s*(.*?)(?:\((.*?)\))?(?:(?:(?:^|@)((?:file|https?|blob|chrome|webpack|resource|capacitor|\[native).*?|[^@]*bundle|\[wasm code\])(?::(\d+))?(?::(\d+))?)|@)\s*$/
const GECKO_EVAL_RE = /(\S+) line (\d+)(?: > eval line \d+)* > eval/

function parseGeckoLine(line: string): StackFrame | undefined {
  const match = GECKO_RE.exec(line)
  if (!match) return undefined

  const isEval = match[3] && match[3].indexOf(' > eval') > -1
  const evalMatch = isEval ? GECKO_EVAL_RE.exec(match[3]) : undefined

  return {
    func: match[1] || UNKNOWN_FUNCTION,
    args: match[2]?.split(',') ?? [],
    url: evalMatch?.[1] ?? match[3],
    line: evalMatch ? +evalMatch[2] : +match[4] || undefined,
    column: +match[5] || undefined,
  }
}

function tryToGetString(obj: unknown, key: string): string | undefined {
  if (obj === null || obj === undefined) return undefined
  const value = (obj as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : undefined
}

export { computeStackTrace, UNKNOWN_FUNCTION }
