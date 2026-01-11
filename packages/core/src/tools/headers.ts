import type { MatchOption } from './matchOption'
import { safeTruncate } from './utils/stringUtils'

export interface NormalizedHeaders {
  skipped?: string[]
  [k: string]: string | string[] | undefined
}

export interface HeaderMatchOption {
  name: MatchOption
  extractor?: MatchOption
}

export interface HeaderCaptureOption {
  match: MatchOption
  request?: boolean | MatchOption[] | HeaderMatchOption[]
  response?: boolean | MatchOption[] | HeaderMatchOption[]
}

// Maximum number of headers to capture
const MAX_HEADER_COUNT = 100

// Maximum bytes per header value (UTF-8 encoding assumed)
const MAX_HEADER_VALUE_BYTES = 128

// Regex pattern to detect sensitive header names
const SENSITIVE_HEADER_PATTERN = /(token|cookie|secret|authorization|(api|secret|access|app).?key)$/i

const DEFAULT_ALLOWED_HEADER_NAMES = new Set<string>([
  'cache-control',
  'etag',
  'age',
  'expires',
  'content-type',
  'content-encoding',
  'vary',
  'content-length',
  'server-timing',
  'x-cache',
])

/**
 * Normalizes headers from various input formats into a consistent structure.
 * Handles Headers object, [key,value] array, Record<string,string>, and XHR getAllResponseHeaders() string.
 */
function normalizeHeaders(input: unknown): NormalizedHeaders | undefined {
  if (!input) {
    return undefined
  }

  const map: Record<string, string> = {}
  const skipped: string[] = []
  let headerCount = 0

  try {
    if (input instanceof Headers) {
      input.forEach((value, key) => {
        if (headerCount < MAX_HEADER_COUNT) {
          assignOrSkip(map, skipped, key, value)
          headerCount++
        }
      })
    } else if (Array.isArray(input)) {
      input.forEach(([key, value]) => {
        if (headerCount < MAX_HEADER_COUNT) {
          assignOrSkip(map, skipped, key, String(value))
          headerCount++
        }
      })
    } else if (typeof input === 'string') {
      input
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .forEach((line) => {
          if (headerCount < MAX_HEADER_COUNT) {
            const idx = line.indexOf(':')
            if (idx > -1) {
              const key = line.slice(0, idx).trim()
              const value = line.slice(idx + 1).trim()
              assignOrSkip(map, skipped, key, value)
              headerCount++
            }
          }
        })
    } else if (typeof input === 'object' && input !== null) {
      Object.entries(input as Record<string, unknown>).forEach(([key, value]) => {
        if (headerCount < MAX_HEADER_COUNT) {
          assignOrSkip(map, skipped, key, String(value))
          headerCount++
        }
      })
    }
  } catch {
    return undefined
  }

  return finalize(map, skipped)
}

export function normalizeRequestInitHeaders(init?: RequestInit): NormalizedHeaders | undefined {
  if (!init || !init.headers) {
    return undefined
  }
  return normalizeHeaders(init.headers)
}

export function normalizeFetchResponseHeaders(response?: Response): NormalizedHeaders | undefined {
  if (!response || !('headers' in response) || !response.headers) {
    return undefined
  }
  return normalizeHeaders(response.headers)
}

export function normalizeXhrResponseHeaders(xhr?: XMLHttpRequest): NormalizedHeaders | undefined {
  if (!xhr) {
    return undefined
  }
  const headerBlock = xhr.getAllResponseHeaders && xhr.getAllResponseHeaders() 
  if (!headerBlock || typeof headerBlock !== 'string') {
    return undefined
  }
  return normalizeHeaders(headerBlock)
}

export function normalizeXhrRequestHeaders(record?: Record<string, string>): NormalizedHeaders | undefined {
  return normalizeHeaders(record)
}

function assignOrSkip(map: Record<string, string>, skipped: string[], key: string, value: string) {
  const lower = key.toLowerCase()

  if (SENSITIVE_HEADER_PATTERN.test(lower)) {
    skipped.push(lower)
    return
  }

  if (DEFAULT_ALLOWED_HEADER_NAMES.has(lower)) {
    map[lower] = safeTruncate(value, MAX_HEADER_VALUE_BYTES)
  } else {
    skipped.push(lower)
  }
}

function finalize(map: Record<string, string>, skipped: string[]): NormalizedHeaders | undefined {
  if (Object.keys(map).length === 0 && skipped.length === 0) {
    return undefined
  }
  const result: NormalizedHeaders = { ...map }
  if (skipped.length) {
    result.skipped = skipped
  }
  return result
}

export function filterHeaders(
  headers: NormalizedHeaders | undefined,
  url: string,
  direction: 'request' | 'response',
  config: HeaderCaptureOption[]
): NormalizedHeaders | undefined {
  if (!headers) {
    return undefined
  }

  const matchingConfig = config.find((option) => {
    if (typeof option.match === 'string') {
      return option.match === url
    } else if (option.match instanceof RegExp) {
      return option.match.test(url)
    } else if (typeof option.match === 'function') {
      return option.match(url)
    }
    return false
  })

  if (!matchingConfig) {
    return undefined
  }

  const directive = matchingConfig[direction]

  if (directive === false || directive === undefined) {
    return undefined
  }

  const filtered: Record<string, string> = {}
  let headerCount = 0

  for (const [key, value] of Object.entries(headers)) {
    if (key === 'skipped' || typeof value !== 'string') {
      continue
    }

    if (headerCount >= MAX_HEADER_COUNT) {
      break
    }

    const shouldInclude = directive === true || shouldIncludeHeader(key, directive)

    if (shouldInclude) {
      const extractedValue = directive === true ? value : extractHeaderValue(key, value, directive)
      filtered[key] = safeTruncate(extractedValue, MAX_HEADER_VALUE_BYTES)
      headerCount++
    }
  }

  if (Object.keys(filtered).length === 0) {
    return undefined
  }

  const result: NormalizedHeaders = filtered
  if (directive === true && headers.skipped && headers.skipped.length > 0) {
    result.skipped = headers.skipped
  }

  return result
}

function shouldIncludeHeader(
  headerName: string,
  directive: Array<string | RegExp | ((value: string) => boolean) | HeaderMatchOption>
): boolean {
  return directive.some((item) => {
    if (typeof item === 'object' && 'name' in item) {
      return matchHeaderName(headerName, item.name)
    }
    return matchHeaderName(headerName, item)
  })
}

function matchHeaderName(headerName: string, match: string | RegExp | ((value: string) => boolean)): boolean {
  if (typeof match === 'string') {
    return match.toLowerCase() === headerName.toLowerCase()
  } else if (match instanceof RegExp) {
    return match.test(headerName)
  } else if (typeof match === 'function') {
    return match(headerName)
  }
  return false
}

function extractHeaderValue(
  headerName: string,
  headerValue: string,
  directive: Array<string | RegExp | ((value: string) => boolean) | HeaderMatchOption>
): string {
  for (const item of directive) {
    if (typeof item === 'object' && 'name' in item && item.extractor) {
      if (matchHeaderName(headerName, item.name)) {
        return applyExtractor(headerValue, item.extractor)
      }
    }
  }
  return headerValue
}

function applyExtractor(value: string, extractor: string | RegExp | ((value: string) => boolean)): string {
  if (extractor instanceof RegExp) {
    const match = value.match(extractor)
    if (match && match[1]) {
      return match[1]
    }
  }
  return value
}
